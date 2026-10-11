import sys
import cv2
from typing import List, Dict, Any
from app.core.logging import logger

def scan_local_devices(max_devices_to_check: int = 5) -> List[Dict[str, Any]]:
    """
    Scans physical and virtual camera devices on the host machine using OpenCV.
    Strictly verifies actual frame reading before confirming device availability.
    Returns list of verified devices:
    [
      {
        "device_index": 0,
        "name": "Local Camera Device #0",
        "resolution": "1920x1080",
        "width": 1920,
        "height": 1080,
        "fps": 30.0,
        "backend": "DSHOW"
      }, ...
    ]
    """
    verified_devices = []

    # Select OpenCV video backend API based on OS platform
    backend_api = cv2.CAP_ANY
    backend_name = "ANY"
    if sys.platform.startswith("win"):
        backend_api = cv2.CAP_DSHOW
        backend_name = "DSHOW"

    logger.info(f"[DevTools] Scanning local camera devices (indices 0..{max_devices_to_check-1})...")

    for idx in range(max_devices_to_check):
        try:
            cap = cv2.VideoCapture(idx, backend_api)
            if not cap.isOpened() and backend_api != cv2.CAP_ANY:
                # Fallback to default OpenCV backend if DSHOW fails to open index
                cap = cv2.VideoCapture(idx)

            if cap.isOpened():
                # Read actual test frame to guarantee device readiness
                ret, frame = cap.read()
                if ret and frame is not None and frame.size > 0:
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or frame.shape[1]
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or frame.shape[0]
                    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

                    device_info = {
                        "device_index": idx,
                        "name": f"Local Camera Device #{idx}",
                        "resolution": f"{width}x{height}",
                        "width": width,
                        "height": height,
                        "fps": float(fps),
                        "backend": backend_name
                    }
                    verified_devices.append(device_info)
                    logger.info(f"[DevTools] Discovered working local camera at index #{idx}: {width}x{height}")

                cap.release()
        except Exception as e:
            logger.debug(f"[DevTools] Index #{idx} probe exception: {e}")

    logger.info(f"[DevTools] Device scan complete. Found {len(verified_devices)} active local camera device(s).")
    return verified_devices
