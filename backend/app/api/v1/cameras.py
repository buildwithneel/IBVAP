import time
import socket
import urllib.parse
import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Union
from app.db.database import get_db
from app.db.models.models import Camera
from app.services.camera_service import CameraService
from app.schemas.schemas import (
    CameraResponse, CameraCreate, CameraUpdate, CameraHealthListResponse,
    CameraStartRequest, CameraStopRequest, ActiveCameraSession, ActiveCameraListResponse,
    CameraTestConnectionRequest, CameraTestConnectionResponse,
    DiscoveredCamera, CameraDiscoveryResponse,
    PTZMoveRequest, PTZStopRequest, PTZPresetCreateRequest, PTZPresetItem, PTZPresetListResponse, PTZCapabilitiesResponse,
    ThermalSettingsRequest, ThermalStatusResponse,
    NightVisionRequest, NightVisionStatusResponse
)
from app.services.onvif_ptz_service import OnvifPTZService
from app.services.camera_control_service import CameraControlService

router = APIRouter(prefix="/cameras", tags=["Cameras"])

@router.post("/test-connection", response_model=CameraTestConnectionResponse)
def test_camera_connection(payload: CameraTestConnectionRequest):
    """
    Tests live camera reachability and stream availability.
    Supports TCP ping, RTSP URL handshake check, and ONVIF discovery test.
    """
    source_type = (payload.source_type or "rtsp").lower()
    stream_url = payload.stream_url.strip() if payload.stream_url else ""
    ip_address = payload.ip_address.strip() if payload.ip_address else ""
    port = payload.port or (554 if source_type == "rtsp" else 80)
    username = payload.username.strip() if payload.username else None
    password = payload.password.strip() if payload.password else None

    # If stream_url is provided, parse host/port if not explicit
    if stream_url and not ip_address:
        try:
            parsed = urllib.parse.urlparse(stream_url)
            if parsed.hostname:
                ip_address = parsed.hostname
                if parsed.port:
                    port = parsed.port
        except Exception:
            pass

    # If IP is provided, test TCP socket reachability first
    reachable = False
    latency_ms = None
    if ip_address:
        t0 = time.time()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.5)
            res = sock.connect_ex((ip_address, port))
            sock.close()
            latency_ms = round((time.time() - t0) * 1000, 1)
            reachable = (res == 0)
        except Exception:
            reachable = False
    elif stream_url:
        # If webcam device index (e.g. "0") or local file
        if stream_url.isdigit() or stream_url.endswith((".mp4", ".avi", ".mkv")):
            reachable = True
            latency_ms = 1.0

    # Build final test stream URL if needed
    final_url = stream_url
    if not final_url and ip_address:
        auth_part = f"{username}:{password}@" if (username and password) else ""
        final_url = f"rtsp://{auth_part}{ip_address}:{port}/stream1"

    # Test OpenCV capture if available and reachable
    success = False
    resolution = None
    fps = None
    message = ""

    if reachable and final_url:
        try:
            import cv2
            cap_source = int(final_url) if final_url.isdigit() else final_url
            cap = cv2.VideoCapture(cap_source)
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 2500)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 2500)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    h, w, _ = frame.shape
                    fps_val = cap.get(cv2.CAP_PROP_FPS) or 30.0
                    resolution = f"{w}x{h}"
                    fps = round(float(fps_val), 1)
                    success = True
                    message = f"Stream verified: {w}x{h} @ {fps}fps (Latency: {latency_ms}ms)"
                else:
                    success = True
                    message = f"RTSP stream handshake accepted on {ip_address}:{port}"
                cap.release()
            else:
                success = True if reachable else False
                message = f"Host {ip_address}:{port} is online and responding via TCP."
        except Exception as e:
            if reachable:
                success = True
                message = f"Port {port} on {ip_address} is open. Handshake response: {str(e)[:80]}"
            else:
                success = False
                message = f"Connection error: {str(e)}"
    elif reachable:
        success = True
        message = f"Network device at {ip_address}:{port} is reachable ({latency_ms}ms latency)."
    else:
        success = False
        message = f"Host {ip_address or 'endpoint'}:{port} is unreachable. Check network route, camera IP, or power."

    return CameraTestConnectionResponse(
        success=success,
        reachable=reachable,
        message=message,
        resolution=resolution,
        fps=fps,
        latency_ms=latency_ms,
        protocol=source_type.upper()
    )

@router.post("/discover", response_model=CameraDiscoveryResponse)
def discover_onvif_cameras(db: Session = Depends(get_db)):
    """
    Broadcasts ONVIF WS-Discovery probe across the local broadcast domain.
    Parses and returns active ONVIF-compatible camera endpoints.
    """
    discovered: List[DiscoveredCamera] = []
    
    # 1. Real WS-Discovery UDP Broadcast on 239.255.255.250:3702
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.settimeout(1.5)
        probe_id = str(uuid.uuid4())
        probe_payload = (
            '<?xml version="1.0" encoding="utf-8"?>\r\n'
            '<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">\r\n'
            '  <Header>\r\n'
            '    <wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>\r\n'
            f'    <wsa:MessageID>urn:uuid:{probe_id}</wsa:MessageID>\r\n'
            '    <wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>\r\n'
            '  </Header>\r\n'
            '  <Body>\r\n'
            '    <Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">\r\n'
            '      <Types xmlns:dn="http://www.onvif.org/ver10/network/wsdl">dn:NetworkVideoTransmitter</Types>\r\n'
            '    </Probe>\r\n'
            '  </Body>\r\n'
            '</Envelope>'
        )
        sock.sendto(probe_payload.encode("utf-8"), ("239.255.255.250", 3702))
        
        seen_ips = set()
        while True:
            try:
                data, addr = sock.recvfrom(65535)
                cam_ip = addr[0]
                if cam_ip in seen_ips:
                    continue
                seen_ips.add(cam_ip)
                raw_text = data.decode("utf-8", errors="ignore")
                
                # Extract XAddrs if present
                xaddrs = f"http://{cam_ip}:80/onvif/device_service"
                if "<d:XAddrs>" in raw_text:
                    start = raw_text.find("<d:XAddrs>") + len("<d:XAddrs>")
                    end = raw_text.find("</d:XAddrs>", start)
                    if end > start:
                        xaddrs = raw_text[start:end].split()[0]
                
                port = 80
                try:
                    parsed_x = urllib.parse.urlparse(xaddrs)
                    if parsed_x.port:
                        port = parsed_x.port
                except Exception:
                    pass

                discovered.append(DiscoveredCamera(
                    ip=cam_ip,
                    port=port,
                    xaddrs=xaddrs,
                    types="NetworkVideoTransmitter",
                    manufacturer="ONVIF IP Camera",
                    model="NVT / Profile S",
                    suggested_stream_url=f"rtsp://{cam_ip}:554/stream1"
                ))
            except socket.timeout:
                break
        sock.close()
    except Exception:
        pass

    now_iso = datetime.datetime.utcnow().isoformat()
    msg = f"Network scan completed. {len(discovered)} ONVIF device(s) found." if discovered else "Local subnet scan completed. 0 ONVIF broadcast devices responded. You can manually register any RTSP/ONVIF camera IP."
    return CameraDiscoveryResponse(
        discovered=discovered,
        total=len(discovered),
        message=msg,
        scanned_at=now_iso
    )

@router.get("/active", response_model=ActiveCameraListResponse)
def get_active_cameras(db: Session = Depends(get_db)):
    """
    Source of truth: returns only the cameras with active running workers in worker_manager.
    """
    from app.workers.video_worker import worker_manager
    active_cams = worker_manager.get_active_cameras(db)
    return {"cameras": active_cams, "total": len(active_cams)}

@router.get("", response_model=Union[List[CameraResponse], dict])
def list_cameras(db: Session = Depends(get_db)):
    cams = CameraService.get_all(db)
    from app.workers.video_worker import worker_manager
    resp = []
    for c in cams:
        if worker_manager.is_running(c.id):
            cur_status = worker_manager.get_status(c.id)
        else:
            if not c.stream_url or c.status == "NOT CONNECTED":
                cur_status = "NOT CONNECTED"
            elif c.status in ["OFFLINE", "STOPPED", "ERROR", "MAINTENANCE"]:
                cur_status = c.status
            else:
                cur_status = "OFFLINE"
        data = CameraResponse.model_validate(c)
        data.status = cur_status
        data.code = c.id if (c.id.startswith("CAM-") or c.id.startswith("SIM-")) else f"CAM-{c.id[:6]}"
        resp.append(data)
    return {"cameras": resp, "total": len(resp)}

@router.get("/health", response_model=CameraHealthListResponse)
def get_cameras_health(db: Session = Depends(get_db)):
    health_data = CameraService.get_health_map(db)
    return CameraHealthListResponse(
        cameras=health_data["cameras"],
        total=health_data["total"]
    )

@router.post("/start", response_model=ActiveCameraSession)
def start_camera(payload: CameraStartRequest, db: Session = Depends(get_db)):
    """
    Starts an active camera session. Accepts real user-provided configuration.
    Validates source, spawns worker, and confirms first frame before marking ONLINE.
    """
    from app.workers.video_worker import worker_manager

    camera_id = payload.camera_id
    cam = None
    if camera_id:
        cam = CameraService.get_by_id(db, camera_id)
        if not cam:
            raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    else:
        if not payload.name or not payload.stream_url:
            raise HTTPException(status_code=400, detail="Missing required camera 'name' or 'stream_url'.")
        source_type = (payload.source_type or "rtsp").lower()
        if source_type not in ["rtsp", "webcam", "file", "onvif"]:
            raise HTTPException(status_code=400, detail=f"Unsupported source type '{source_type}'. Must be rtsp, webcam, or file.")

        stream_url = payload.stream_url.strip()
        if source_type == "rtsp" and not (stream_url.startswith("rtsp://") or stream_url.startswith("rtsps://") or stream_url.startswith("http")):
            raise HTTPException(status_code=400, detail="Invalid RTSP URL format. Must start with rtsp:// or rtsps://")

        cam = Camera(
            name=payload.name.strip(),
            stream_url=stream_url,
            source_type=source_type,
            status="STARTING",
            sector=payload.sector.strip() if payload.sector else None,
            location=payload.location.strip() if payload.location else None
        )
        db.add(cam)
        db.commit()
        db.refresh(cam)

    # Launch AI worker thread
    worker_manager.start_worker(cam.id, cam.source_type, cam.stream_url)

    # Allow worker a brief window to confirm first frame (Requirement 14)
    for _ in range(15):
        if worker_manager.is_running(cam.id):
            break
        worker = worker_manager.workers.get(cam.id)
        if worker and worker.status == "OFFLINE":
            raise HTTPException(status_code=400, detail=f"Failed to connect to video stream: {worker.last_error or 'Source unavailable'}")
        time.sleep(0.1)

    telem = worker_manager.get_telemetry(cam.id)
    return {
        "id": cam.id,
        "camera_id": cam.id,
        "name": cam.name,
        "source_type": cam.source_type,
        "status": worker_manager.get_status(cam.id),
        "sector": cam.sector,
        "location": cam.location,
        "fps": telem["fps"],
        "latency_ms": telem["latency_ms"],
        "resolution": telem["resolution"],
        "width": telem["width"],
        "height": telem["height"],
        "active_tracks": telem["active_tracks"],
        "frames_processed": telem["frames_processed"],
        "uptime_seconds": telem["uptime_seconds"],
        "stream_url": f"/api/v1/streams/{cam.id}/mjpeg"
    }

def do_stop_camera(camera_id: str, db: Session):
    from app.workers.video_worker import worker_manager
    stopped = worker_manager.stop_worker(camera_id)
    cam = CameraService.get_by_id(db, camera_id)
    if cam:
        cam.status = "STOPPED"
        db.commit()
    return {
        "camera_id": camera_id,
        "status": "STOPPED",
        "stopped": stopped,
        "message": "Camera stopped successfully." if stopped else "Camera was already stopped."
    }

@router.post("/stop")
def stop_camera_body(payload: CameraStopRequest, db: Session = Depends(get_db)):
    """
    Idempotent stop camera endpoint.
    """
    return do_stop_camera(payload.camera_id, db)

@router.post("/{camera_id}/stop")
def stop_camera_path(camera_id: str, db: Session = Depends(get_db)):
    """
    Idempotent stop camera endpoint by path ID.
    """
    return do_stop_camera(camera_id, db)

@router.get("/{camera_id}", response_model=CameraResponse)
def get_camera(camera_id: str, db: Session = Depends(get_db)):
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    from app.workers.video_worker import worker_manager
    if worker_manager.is_running(cam.id):
        cur_status = worker_manager.get_status(cam.id)
    else:
        if not cam.stream_url or cam.status == "NOT CONNECTED":
            cur_status = "NOT CONNECTED"
        elif cam.status in ["OFFLINE", "STOPPED", "ERROR", "MAINTENANCE"]:
            cur_status = cam.status
        else:
            cur_status = "OFFLINE"
    data = CameraResponse.model_validate(cam)
    data.status = cur_status
    data.code = cam.id if (cam.id.startswith("CAM-") or cam.id.startswith("SIM-")) else f"CAM-{cam.id[:6]}"
    return data

@router.post("", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
def create_camera(payload: CameraCreate, db: Session = Depends(get_db)):
    cam = CameraService.create(db, payload)
    return cam

@router.put("/{camera_id}", response_model=CameraResponse)
def update_camera(camera_id: str, payload: CameraUpdate, db: Session = Depends(get_db)):
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    return CameraService.update(db, cam, payload)

@router.patch("/{camera_id}/status", response_model=CameraResponse)
def update_camera_status(camera_id: str, payload: dict, db: Session = Depends(get_db)):
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    new_status = payload.get("status", "STOPPED")
    cam.status = new_status
    db.commit()
    db.refresh(cam)
    return cam

@router.post("/{camera_id}/reboot")
def reboot_camera(camera_id: str, db: Session = Depends(get_db)):
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    from app.workers.video_worker import worker_manager
    worker_manager.stop_worker(cam.id)
    worker_manager.start_worker(cam.id, cam.source_type, cam.stream_url)
    return {"message": f"Camera '{camera_id}' reboot sequence triggered.", "status": "REBOOTING"}

@router.post("/{camera_id}/diagnostic")
def camera_diagnostic(camera_id: str, db: Session = Depends(get_db)):
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    from app.workers.video_worker import worker_manager
    telem = worker_manager.get_telemetry(cam.id)
    is_active = worker_manager.is_running(cam.id)

    return {
        "latencyMs": telem.get("latency_ms"),
        "packetLoss": None,
        "resolution": telem.get("resolution") or "N/A",
        "temperature": None,
        "sensorStatus": "PASS" if is_active else "FAIL",
        "measuredFps": telem.get("fps"),
        "framesProcessed": telem.get("frames_processed", 0)
    }

@router.delete("/{camera_id}")
def delete_camera(camera_id: str, db: Session = Depends(get_db)):
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    CameraService.delete(db, cam)
    return {"message": "Camera deleted successfully"}

# =========================================================================
# PTZ CAMERA CONTROLS (ONVIF Profile S + Simulated Testing)
# =========================================================================

@router.get("/{camera_id}/ptz/capabilities", response_model=PTZCapabilitiesResponse)
def get_camera_ptz_capabilities(camera_id: str, db: Session = Depends(get_db)):
    """
    Returns live PTZ capabilities, protocol support, and preset positions for target camera.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    return OnvifPTZService.get_capabilities(cam)

@router.post("/{camera_id}/ptz/move")
def ptz_move(camera_id: str, payload: PTZMoveRequest, db: Session = Depends(get_db)):
    """
    Executes Pan, Tilt, or Zoom movement on target camera.
    Supports continuous or relative directional movement.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    res = OnvifPTZService.move(
        camera=cam,
        command=payload.command,
        pan=payload.pan,
        tilt=payload.tilt,
        zoom=payload.zoom,
        speed=payload.speed
    )
    if not res.get("success", False) and not res.get("is_simulated", False):
        raise HTTPException(status_code=400, detail=res.get("message", "PTZ command failed"))
    return res

@router.post("/{camera_id}/ptz/stop")
def ptz_stop(camera_id: str, payload: PTZStopRequest = None, db: Session = Depends(get_db)):
    """
    Immediately halts all PTZ motor or viewport movement.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    pan_tilt = payload.pan_tilt if payload else True
    zoom = payload.zoom if payload else True
    return OnvifPTZService.stop(cam, pan_tilt=pan_tilt, zoom=zoom)

@router.get("/{camera_id}/ptz/presets", response_model=PTZPresetListResponse)
def get_camera_ptz_presets(camera_id: str, db: Session = Depends(get_db)):
    """
    Lists saved PTZ preset positions for camera.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    presets = OnvifPTZService.get_presets(cam)
    return {
        "camera_id": camera_id,
        "presets": presets,
        "total": len(presets)
    }

@router.post("/{camera_id}/ptz/presets")
def create_camera_ptz_preset(camera_id: str, payload: PTZPresetCreateRequest, db: Session = Depends(get_db)):
    """
    Saves current camera orientation as a new preset position.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    return OnvifPTZService.set_preset(cam, payload.name)

@router.post("/{camera_id}/ptz/presets/{preset_token}/goto")
def goto_camera_ptz_preset(camera_id: str, preset_token: str, db: Session = Depends(get_db)):
    """
    Commands camera to move to designated preset position.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    return OnvifPTZService.goto_preset(cam, preset_token)

# =========================================================================
# THERMAL IMAGING CONTROLS
# =========================================================================

@router.get("/{camera_id}/thermal", response_model=ThermalStatusResponse)
def get_camera_thermal_status(camera_id: str, db: Session = Depends(get_db)):
    """
    Queries whether camera has genuine radiometric thermal hardware or simulated software rendering.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    return CameraControlService.get_thermal_status(cam)

@router.post("/{camera_id}/thermal")
def set_camera_thermal_settings(camera_id: str, payload: ThermalSettingsRequest, db: Session = Depends(get_db)):
    """
    Toggles thermal visualization and selects color palette without interrupting the video feed.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    res = CameraControlService.set_thermal_settings(
        camera=cam,
        enabled=payload.enabled,
        palette=payload.palette or "ironbow",
        simulate_on_rgb=payload.simulate_on_rgb or False
    )
    if not res.get("success", False):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res

# =========================================================================
# NIGHT VISION CONTROLS
# =========================================================================

@router.get("/{camera_id}/night-vision", response_model=NightVisionStatusResponse)
def get_camera_night_vision_status(camera_id: str, db: Session = Depends(get_db)):
    """
    Queries hardware IR cut filter capabilities and current scene darkness/luminance.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    return CameraControlService.get_night_vision_status(cam)

@router.post("/{camera_id}/night-vision")
def set_camera_night_vision_mode(camera_id: str, payload: NightVisionRequest, db: Session = Depends(get_db)):
    """
    Commands hardware IR cut filter switching (AUTO, DAY, NIGHT) or enables digital low-light enhancement.
    """
    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")
    res = CameraControlService.set_night_vision_mode(cam, payload.mode)
    if not res.get("success", False):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


# =========================================================================
# SURVEILLANCE SNAPSHOT CAPTURE
# =========================================================================

@router.post("/{camera_id}/snapshot")
def capture_camera_snapshot(camera_id: str, db: Session = Depends(get_db)):
    """
    Captures a real video frame directly from the running camera worker or camera source,
    computes bit-for-bit SHA-256 hash, stores in evidence storage, and records an Evidence item.
    Guarantees non-black, real video frames with zero browser CORS restrictions.
    """
    import cv2
    import numpy as np
    from app.workers.video_worker import worker_manager
    from app.services.evidence_service import EvidenceService

    cam = CameraService.get_by_id(db, camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")

    frame = None

    # 1. Grab latest frame from running video worker (raw or annotated)
    frame = worker_manager.get_latest_frame(camera_id)
    if frame is None:
        frame = worker_manager.get_latest_raw_frame(camera_id)

    # 2. If worker is not currently running or has no frame cached, try opening camera's video source directly
    if frame is None and cam.stream_url:
        cap_source = int(cam.stream_url) if str(cam.stream_url).isdigit() else cam.stream_url
        cap = cv2.VideoCapture(cap_source)
        try:
            if cap.isOpened():
                ret, candidate_frame = cap.read()
                if ret and candidate_frame is not None and candidate_frame.size > 0:
                    frame = candidate_frame
        finally:
            cap.release()

    # 3. Verify valid frame was captured
    if frame is None or frame.size == 0:
        raise HTTPException(
            status_code=400,
            detail=f"Camera '{camera_id}' is offline or not producing valid video frames. Start stream first."
        )

    # 4. Reject completely black or uninitialized blank frames
    if float(np.mean(frame)) < 2.0:
        raise HTTPException(
            status_code=400,
            detail="Captured frame is black or uninitialized. Wait for stream to stabilize before taking a snapshot."
        )

    # 5. Save evidence using standard EvidenceService with SHA-256 hash
    now = datetime.datetime.utcnow()
    evidence = EvidenceService.create_snapshot_evidence(
        db=db,
        frame=frame,
        event_type="SURVEILLANCE_SNAPSHOT",
        timestamp=now
    )

    # Update camera last_seen_at
    cam.last_seen_at = now
    db.commit()

    return {
        "message": f"Surveillance snapshot captured successfully for camera {camera_id}.",
        "evidence_id": evidence.id,
        "snapshot_url": evidence.image_path,
        "sha256": evidence.sha256,
        "camera_id": camera_id,
        "camera_name": cam.name,
        "sector": cam.sector,
        "timestamp": evidence.created_at.isoformat() if evidence.created_at else now.isoformat(),
        "file_size_bytes": evidence.file_size_bytes,
        "capture_status": "SUCCESS"
    }


