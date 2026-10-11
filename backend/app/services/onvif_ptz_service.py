import re
import time
import base64
import hashlib
import os
import urllib.parse
from datetime import datetime
from typing import Dict, Any, List, Optional
import requests

from app.core.logging import logger
from app.db.models.models import Camera

class OnvifPTZService:
    """
    ONVIF Profile S PTZ Service Client.
    Provides standard ONVIF PTZ operations:
    - ContinuousMove, RelativeMove, Stop
    - GetPresets, SetPreset, GotoPreset, RemovePreset
    - Discovery of PTZ Service URL & Media Profiles
    - WS-Security PasswordDigest & PasswordText Authentication
    - Graceful fallback & explicit handling of simulated / non-PTZ cameras.
    """

    @staticmethod
    def _generate_ws_security_header(username: Optional[str], password: Optional[str]) -> str:
        """Generates WS-Security UsernameToken header with PasswordDigest."""
        if not username or not password:
            return ""

        created = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
        nonce_raw = os.urandom(16)
        nonce_b64 = base64.b64encode(nonce_raw).decode("utf-8")

        # PasswordDigest = Base64( SHA-1( Nonce + Created + Password ) )
        sha1 = hashlib.sha1()
        sha1.update(nonce_raw + created.encode("utf-8") + password.encode("utf-8"))
        digest_b64 = base64.b64encode(sha1.digest()).decode("utf-8")

        return f"""
        <s:Header>
            <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
                           xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
                <wsse:UsernameToken>
                    <wsse:Username>{username}</wsse:Username>
                    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">{digest_b64}</wsse:Password>
                    <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">{nonce_b64}</wsse:Nonce>
                    <wsu:Created>{created}</wsu:Created>
                </wsse:UsernameToken>
            </wsse:Security>
        </s:Header>
        """

    @classmethod
    def _send_soap(cls, endpoint: str, body: str, username: Optional[str] = None, password: Optional[str] = None, timeout: float = 3.0) -> Optional[str]:
        """Dispatches a SOAP 1.2 request to the target ONVIF service endpoint."""
        header = cls._generate_ws_security_header(username, password)
        envelope = f"""<?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
                    xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
                    xmlns:tt="http://www.onvif.org/ver10/schema"
                    xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
                    xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
            {header}
            <s:Body>
                {body}
            </s:Body>
        </s:Envelope>
        """
        headers = {
            "Content-Type": "application/soap+xml; charset=utf-8",
            "User-Agent": "IBVAP-CCTV-PTZClient/1.0"
        }
        auth = requests.auth.HTTPDigestAuth(username, password) if username and password else None
        try:
            resp = requests.post(endpoint, data=envelope.encode("utf-8"), headers=headers, auth=auth, timeout=timeout)
            if resp.status_code in [200, 201]:
                return resp.text
            else:
                logger.debug(f"ONVIF SOAP error ({endpoint}): HTTP {resp.status_code} - {resp.text[:120]}")
                return None
        except Exception as e:
            logger.debug(f"ONVIF SOAP connection error to {endpoint}: {e}")
            return None

    @classmethod
    def get_ptz_endpoint(cls, camera: Camera) -> Optional[str]:
        """Resolves target ONVIF PTZ service URL."""
        if camera.ptz_service_url:
            return camera.ptz_service_url

        ip = camera.ip_address
        if not ip and camera.stream_url:
            try:
                parsed = urllib.parse.urlparse(camera.stream_url)
                ip = parsed.hostname
            except Exception:
                pass

        if not ip:
            return None

        port = camera.port or 80
        # Default standard ONVIF PTZ service URL
        return f"http://{ip}:{port}/onvif/ptz_service"

    @classmethod
    def get_capabilities(cls, camera: Camera) -> Dict[str, Any]:
        """
        Queries camera PTZ capabilities.
        Distinguishes physical ONVIF cameras from simulated video files.
        """
        is_sim = bool(
            camera.source_type in ["file", "simulated"] or
            "TEST STREAM" in (camera.name or "") or
            "test_stream" in (camera.stream_url or "") or
            "uploads" in (camera.stream_url or "")
        )

        if is_sim:
            return {
                "camera_id": camera.id,
                "is_ptz_supported": False,
                "is_simulated": True,
                "ptz_type": "simulated_viewport",
                "supports_continuous_move": True,
                "supports_relative_move": True,
                "supports_zoom": True,
                "supports_presets": True,
                "presets": [
                    {"token": "PRESET_SIM_1", "name": "Gate Approach (Simulated)"},
                    {"token": "PRESET_SIM_2", "name": "Inspection Lane (Simulated)"},
                    {"token": "PRESET_SIM_3", "name": "Perimeter Wall (Simulated)"}
                ],
                "message": "Simulated CCTV test feed. Physical PTZ motors are not present on recorded video files; digital viewport pan/zoom is active for interface testing."
            }

        # Check physical ONVIF endpoint
        ptz_url = cls.get_ptz_endpoint(camera)
        if not ptz_url:
            return {
                "camera_id": camera.id,
                "is_ptz_supported": False,
                "is_simulated": False,
                "ptz_type": "fixed_unsupported",
                "supports_continuous_move": False,
                "supports_relative_move": False,
                "supports_zoom": False,
                "supports_presets": False,
                "presets": [],
                "message": "Fixed camera station. No PTZ motor service detected."
            }

        # Test reachability of PTZ service
        body = "<tptz:GetConfigurations/>"
        resp = cls._send_soap(ptz_url, body, camera.username, timeout=2.0)
        has_ptz = resp is not None and ("faultcode" not in resp.lower())

        presets = cls.get_presets(camera) if has_ptz else []

        return {
            "camera_id": camera.id,
            "is_ptz_supported": has_ptz,
            "is_simulated": False,
            "ptz_type": "onvif_profile_s" if has_ptz else "fixed_unsupported",
            "supports_continuous_move": has_ptz,
            "supports_relative_move": has_ptz,
            "supports_zoom": has_ptz,
            "supports_presets": has_ptz,
            "presets": presets,
            "message": "ONVIF Profile S PTZ Service active and responding." if has_ptz else "Camera is reachable, but PTZ service did not respond or PTZ is disabled on camera."
        }

    @classmethod
    def move(
        cls,
        camera: Camera,
        command: str = "relative",
        pan: float = 0.0,
        tilt: float = 0.0,
        zoom: float = 0.0,
        speed: float = 1.0
    ) -> Dict[str, Any]:
        """
        Executes Pan-Tilt-Zoom command.
        Supports:
        - continuous: moves continuously until stop() is called.
        - relative: discrete step in degrees / fractions.
        - directional shortcuts: 'left', 'right', 'up', 'down', 'zoom_in', 'zoom_out'.
        """
        is_sim = bool(
            camera.source_type in ["file", "simulated"] or
            "TEST STREAM" in (camera.name or "") or
            "uploads" in (camera.stream_url or "")
        )

        # Normalize directional commands
        cmd = command.lower()
        sp = max(0.1, min(1.0, float(speed)))
        if cmd == "left":
            pan, tilt, zoom = -sp, 0.0, 0.0
        elif cmd == "right":
            pan, tilt, zoom = sp, 0.0, 0.0
        elif cmd == "up":
            pan, tilt, zoom = 0.0, sp, 0.0
        elif cmd == "down":
            pan, tilt, zoom = 0.0, -sp, 0.0
        elif cmd == "zoom_in":
            pan, tilt, zoom = 0.0, 0.0, sp
        elif cmd == "zoom_out":
            pan, tilt, zoom = 0.0, 0.0, -sp

        if is_sim:
            from app.workers.video_worker import worker_manager
            worker = worker_manager.workers.get(camera.id)
            if worker:
                curr_p = getattr(worker, "viewport_pan", 0.0)
                curr_t = getattr(worker, "viewport_tilt", 0.0)
                curr_z = getattr(worker, "viewport_zoom", 1.0)
                worker.viewport_pan = max(-1.0, min(1.0, curr_p + pan * 0.15 * sp))
                worker.viewport_tilt = max(-1.0, min(1.0, curr_t + tilt * 0.15 * sp))
                worker.viewport_zoom = max(1.0, min(5.0, curr_z + zoom * 0.25 * sp))

            return {
                "success": True,
                "camera_id": camera.id,
                "is_simulated": True,
                "command": cmd,
                "pan": pan,
                "tilt": tilt,
                "zoom": zoom,
                "speed": sp,
                "message": f"Simulated digital viewport adjusted (Pan: {pan:.2f}, Tilt: {tilt:.2f}, Zoom: {zoom:.2f})."
            }

        ptz_url = cls.get_ptz_endpoint(camera)
        if not ptz_url:
            return {
                "success": False,
                "camera_id": camera.id,
                "message": "Camera does not support PTZ commands (no PTZ service configured)."
            }

        profile_token = "Profile_1"  # Default Profile Token for ONVIF Profile S

        if cmd in ["continuous", "left", "right", "up", "down", "zoom_in", "zoom_out"]:
            soap_body = f"""
            <tptz:ContinuousMove>
                <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>
                <tptz:Velocity>
                    <tt:PanTilt x="{pan:.3f}" y="{tilt:.3f}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
                    <tt:Zoom x="{zoom:.3f}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
                </tptz:Velocity>
                <tptz:Timeout>PT5S</tptz:Timeout>
            </tptz:ContinuousMove>
            """
        else:
            soap_body = f"""
            <tptz:RelativeMove>
                <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>
                <tptz:Translation>
                    <tt:PanTilt x="{pan:.3f}" y="{tilt:.3f}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
                    <tt:Zoom x="{zoom:.3f}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
                </tptz:Translation>
            </tptz:RelativeMove>
            """

        resp = cls._send_soap(ptz_url, soap_body, camera.username)
        if resp and ("faultcode" not in resp.lower()):
            return {
                "success": True,
                "camera_id": camera.id,
                "is_simulated": False,
                "command": cmd,
                "pan": pan,
                "tilt": tilt,
                "zoom": zoom,
                "speed": sp,
                "message": "ONVIF PTZ command executed successfully."
            }
        else:
            return {
                "success": False,
                "camera_id": camera.id,
                "is_simulated": False,
                "message": "ONVIF PTZ device rejected movement command or timed out."
            }

    @classmethod
    def stop(cls, camera: Camera, pan_tilt: bool = True, zoom: bool = True) -> Dict[str, Any]:
        """Immediately halts ongoing continuous movement."""
        is_sim = bool(
            camera.source_type in ["file", "simulated"] or
            "TEST STREAM" in (camera.name or "") or
            "uploads" in (camera.stream_url or "")
        )

        if is_sim:
            return {
                "success": True,
                "camera_id": camera.id,
                "is_simulated": True,
                "message": "Simulated viewport movement halted."
            }

        ptz_url = cls.get_ptz_endpoint(camera)
        if not ptz_url:
            return {"success": False, "camera_id": camera.id, "message": "No PTZ service available for this camera."}

        profile_token = "Profile_1"
        soap_body = f"""
        <tptz:Stop>
            <tptz:ProfileToken>{profile_token}</tptz:ProfileToken>
            <tptz:PanTilt>{str(pan_tilt).lower()}</tptz:PanTilt>
            <tptz:Zoom>{str(zoom).lower()}</tptz:Zoom>
        </tptz:Stop>
        """

        resp = cls._send_soap(ptz_url, soap_body, camera.username)
        success = bool(resp and "faultcode" not in resp.lower())
        return {
            "success": success,
            "camera_id": camera.id,
            "message": "ONVIF PTZ motor stopped immediately." if success else "Failed to dispatch Stop command to camera."
        }

    @classmethod
    def get_presets(cls, camera: Camera) -> List[Dict[str, str]]:
        """Retrieves configured PTZ preset positions."""
        is_sim = bool(
            camera.source_type in ["file", "simulated"] or
            "TEST STREAM" in (camera.name or "") or
            "uploads" in (camera.stream_url or "")
        )

        if is_sim:
            return [
                {"token": "PRESET_SIM_1", "name": "Gate Approach (Simulated)"},
                {"token": "PRESET_SIM_2", "name": "Inspection Lane (Simulated)"},
                {"token": "PRESET_SIM_3", "name": "Perimeter Wall (Simulated)"}
            ]

        ptz_url = cls.get_ptz_endpoint(camera)
        if not ptz_url:
            return []

        soap_body = "<tptz:GetPresets><tptz:ProfileToken>Profile_1</tptz:ProfileToken></tptz:GetPresets>"
        resp = cls._send_soap(ptz_url, soap_body, camera.username)
        if not resp:
            return []

        presets = []
        tokens = re.findall(r'<tptz:Preset\s+token="([^"]+)">.*?<tt:Name>([^<]+)</tt:Name>', resp, re.DOTALL)
        for tok, name in tokens:
            presets.append({"token": tok, "name": name})

        return presets

    @classmethod
    def goto_preset(cls, camera: Camera, preset_token: str) -> Dict[str, Any]:
        """Recalls camera to designated preset position."""
        is_sim = bool(
            camera.source_type in ["file", "simulated"] or
            "TEST STREAM" in (camera.name or "") or
            "uploads" in (camera.stream_url or "")
        )

        if is_sim:
            from app.workers.video_worker import worker_manager
            worker = worker_manager.workers.get(camera.id)
            if worker:
                tok_str = str(preset_token).lower()
                if "1" in tok_str or "gate" in tok_str:
                    worker.viewport_zoom = 1.8
                    worker.viewport_pan = -0.35
                    worker.viewport_tilt = 0.20
                elif "2" in tok_str or "lane" in tok_str:
                    worker.viewport_zoom = 2.4
                    worker.viewport_pan = 0.30
                    worker.viewport_tilt = -0.15
                elif "3" in tok_str or "wall" in tok_str:
                    worker.viewport_zoom = 1.5
                    worker.viewport_pan = 0.45
                    worker.viewport_tilt = 0.35
                else:
                    worker.viewport_zoom = 1.0
                    worker.viewport_pan = 0.0
                    worker.viewport_tilt = 0.0

            return {
                "success": True,
                "camera_id": camera.id,
                "is_simulated": True,
                "preset_token": preset_token,
                "message": f"Simulated camera recalled to preset '{preset_token}'."
            }

        ptz_url = cls.get_ptz_endpoint(camera)
        if not ptz_url:
            return {"success": False, "message": "PTZ not supported on this camera."}

        soap_body = f"""
        <tptz:GotoPreset>
            <tptz:ProfileToken>Profile_1</tptz:ProfileToken>
            <tptz:PresetToken>{preset_token}</tptz:PresetToken>
        </tptz:GotoPreset>
        """
        resp = cls._send_soap(ptz_url, soap_body, camera.username)
        success = bool(resp and "faultcode" not in resp.lower())
        return {
            "success": success,
            "camera_id": camera.id,
            "preset_token": preset_token,
            "message": f"Camera navigating to preset '{preset_token}'." if success else "Failed to recall ONVIF preset."
        }

    @classmethod
    def set_preset(cls, camera: Camera, preset_name: str) -> Dict[str, Any]:
        """Saves current camera orientation as a new preset position."""
        is_sim = bool(
            camera.source_type in ["file", "simulated"] or
            "TEST STREAM" in (camera.name or "") or
            "uploads" in (camera.stream_url or "")
        )

        clean_name = preset_name.strip() or f"Preset {int(time.time())}"
        tok = f"PRESET_{int(time.time())}"

        if is_sim:
            return {
                "success": True,
                "camera_id": camera.id,
                "preset_token": tok,
                "name": clean_name,
                "is_simulated": True,
                "message": f"Saved simulated preset position '{clean_name}'."
            }

        ptz_url = cls.get_ptz_endpoint(camera)
        if not ptz_url:
            return {"success": False, "message": "PTZ not supported on this camera."}

        soap_body = f"""
        <tptz:SetPreset>
            <tptz:ProfileToken>Profile_1</tptz:ProfileToken>
            <tptz:PresetName>{clean_name}</tptz:PresetName>
        </tptz:SetPreset>
        """
        resp = cls._send_soap(ptz_url, soap_body, camera.username)
        success = bool(resp and "faultcode" not in resp.lower())
        return {
            "success": success,
            "camera_id": camera.id,
            "preset_token": tok,
            "name": clean_name,
            "message": f"ONVIF preset '{clean_name}' saved successfully." if success else "Failed to save ONVIF preset."
        }
