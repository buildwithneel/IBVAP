from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel, field_validator
from typing import Optional, List, Union
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.database import get_db
from app.db.models.models import Camera
from app.workers.video_worker import worker_manager
from app.devtools.local_camera.device_scanner import scan_local_devices

router = APIRouter(prefix="/devtools/local-cameras", tags=["DevTools - Local Camera (DEV ONLY)"])

def verify_testing_enabled():
    if not settings.ENABLE_LOCAL_CAMERA_TESTING:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Local camera testing module is disabled. Set ENABLE_LOCAL_CAMERA_TESTING=true in .env to enable."
        )

class LocalCameraStartRequest(BaseModel):
    device_index: Optional[Union[int, str]] = 0
    name: Optional[str] = None
    sector: Optional[str] = "Sector 01 Dev"

    @field_validator("device_index", mode="before")
    @classmethod
    def parse_device_index(cls, v):
        if v is None or v == "":
            return 0
        try:
            return int(v)
        except (ValueError, TypeError):
            return 0

class LocalCameraStopRequest(BaseModel):
    device_index: Optional[Union[int, str]] = None
    camera_id: Optional[str] = None

    @field_validator("device_index", mode="before")
    @classmethod
    def parse_device_index(cls, v):
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

@router.get("", dependencies=[Depends(verify_testing_enabled)])
def discover_local_cameras():
    """
    [DEV ONLY] Discovers available physical and virtual camera hardware devices on the local machine.
    """
    devices = scan_local_devices()
    return {
        "devices": devices,
        "total": len(devices)
    }

@router.post("/start", dependencies=[Depends(verify_testing_enabled)])
def start_local_camera_testing(
    payload: Optional[LocalCameraStartRequest] = Body(default=None),
    db: Session = Depends(get_db)
):
    """
    [DEV ONLY] Starts real-time AI ingestion pipeline using a local webcam or virtual camera.
    """
    if payload is None:
        payload = LocalCameraStartRequest()

    device_idx = payload.device_index if payload.device_index is not None else 0
    str_url = str(device_idx)
    cam_name = payload.name or f"Local Dev Camera #{device_idx}"

    camera = db.query(Camera).filter(
        (Camera.stream_url == str_url) & (Camera.source_type == "webcam")
    ).first()

    if not camera:
        camera = Camera(
            name=cam_name,
            stream_url=str_url,
            source_type="webcam",
            status="STARTING",
            sector=payload.sector or "Sector 01 Dev",
            location="Local Machine Web Camera"
        )
        db.add(camera)
        db.commit()
        db.refresh(camera)
    else:
        camera.status = "STARTING"
        db.commit()
        db.refresh(camera)

    started = worker_manager.start_worker(camera.id, "webcam", str_url)

    return {
        "message": f"Local camera #{device_idx} connected to AI pipeline.",
        "camera_id": camera.id,
        "device_index": device_idx,
        "worker_started": started,
        "status": worker_manager.get_status(camera.id)
    }

@router.post("/stop", dependencies=[Depends(verify_testing_enabled)])
def stop_local_camera_testing(
    payload: Optional[LocalCameraStopRequest] = Body(default=None),
    db: Session = Depends(get_db)
):
    """
    [DEV ONLY] Stops real-time AI ingestion stream for local camera.
    """
    if payload is None:
        payload = LocalCameraStopRequest()

    camera_id = payload.camera_id
    if not camera_id and payload.device_index is not None:
        camera = db.query(Camera).filter(
            (Camera.stream_url == str(payload.device_index)) & (Camera.source_type == "webcam")
        ).first()
        if camera:
            camera_id = camera.id

    if not camera_id:
        active_cam = db.query(Camera).filter(
            (Camera.source_type == "webcam") & (Camera.status.in_(["STARTING", "ACTIVE", "ONLINE"]))
        ).first()
        if active_cam:
            camera_id = active_cam.id
        else:
            cam0 = db.query(Camera).filter(
                (Camera.stream_url == "0") & (Camera.source_type == "webcam")
            ).first()
            if cam0:
                camera_id = cam0.id

    if not camera_id:
        raise HTTPException(status_code=404, detail="No active local camera found matching request parameters.")

    stopped = worker_manager.stop_worker(camera_id)
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if cam:
        cam.status = "STOPPED"
        db.commit()

    return {
        "message": "Local camera stream stopped.",
        "camera_id": camera_id,
        "stopped": stopped
    }
