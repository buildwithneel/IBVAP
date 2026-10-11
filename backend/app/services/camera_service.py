from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
from app.db.models.models import Camera, Detection
from app.schemas.schemas import CameraCreate, CameraUpdate

ALL_STANDARD_CAMERAS_CONFIG = [
    {
        "id": "CAM-05",
        "name": "CAM-05 [Forward Outpost Watch - Disconnected]",
        "sector": "Sector Alpha",
        "location": "BP-05",
        "status": "OFFLINE",
        "stream_url": "rtsp://10.142.1.85:554/live/stream1",
        "source_type": "rtsp",
        "latitude": 34.0880,
        "longitude": 74.7990,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-06",
        "name": "CAM-06 [Valley River Defile - Unconfigured]",
        "sector": "Sector Alpha",
        "location": "BP-06",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.0895,
        "longitude": 74.8005,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-07",
        "name": "CAM-07 [Valley Perimeter Outpost]",
        "sector": "Sector Bravo",
        "location": "BP-07",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.0910,
        "longitude": 74.8020,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-08",
        "name": "CAM-08 [Highway Junction Alpha]",
        "sector": "Sector Bravo",
        "location": "BP-08",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.0935,
        "longitude": 74.8055,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-09",
        "name": "CAM-09 [Southern Ridge Sensor]",
        "sector": "Sector Bravo",
        "location": "BP-09",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.0960,
        "longitude": 74.8080,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-10",
        "name": "CAM-10 [Eastern Creek Crossing]",
        "sector": "Sector Bravo",
        "location": "BP-10",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.0985,
        "longitude": 74.8115,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-11",
        "name": "CAM-11 [Border Checkpoint Charlie]",
        "sector": "Sector Bravo",
        "location": "BP-11",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1010,
        "longitude": 74.8140,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-12",
        "name": "CAM-12 [Depot Perimeter Gate]",
        "sector": "Sector Bravo",
        "location": "BP-12",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1035,
        "longitude": 74.8175,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-13",
        "name": "CAM-13 [Riverine Delta Watch]",
        "sector": "Sector Charlie",
        "location": "BP-13",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1060,
        "longitude": 74.8200,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-14",
        "name": "CAM-14 [Marshlands Patrol Post]",
        "sector": "Sector Charlie",
        "location": "BP-14",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1085,
        "longitude": 74.8235,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-15",
        "name": "CAM-15 [Bridge Entryway North]",
        "sector": "Sector Charlie",
        "location": "BP-15",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1110,
        "longitude": 74.8260,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-16",
        "name": "CAM-16 [Canal Bank Observation]",
        "sector": "Sector Charlie",
        "location": "BP-16",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1135,
        "longitude": 74.8295,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-17",
        "name": "CAM-17 [Ferry Terminal South]",
        "sector": "Sector Charlie",
        "location": "BP-17",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1160,
        "longitude": 74.8320,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-18",
        "name": "CAM-18 [Delta Basin Sentry]",
        "sector": "Sector Charlie",
        "location": "BP-18",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1185,
        "longitude": 74.8355,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-19",
        "name": "CAM-19 [High Mountain Pass]",
        "sector": "Sector Delta",
        "location": "BP-19",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1210,
        "longitude": 74.8380,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-20",
        "name": "CAM-20 [Eastern Ravine Mast]",
        "sector": "Sector Delta",
        "location": "BP-20",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1235,
        "longitude": 74.8415,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-21",
        "name": "CAM-21 [Forward Bunker Sentry]",
        "sector": "Sector Delta",
        "location": "BP-21",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1260,
        "longitude": 74.8440,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-22",
        "name": "CAM-22 [Perimeter Fence Corner]",
        "sector": "Sector Delta",
        "location": "BP-22",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1285,
        "longitude": 74.8475,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-23",
        "name": "CAM-23 [Plateau Surveillance Post]",
        "sector": "Sector Delta",
        "location": "BP-23",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1310,
        "longitude": 74.8500,
        "fps": 25,
        "enabled": True
    },
    {
        "id": "CAM-24",
        "name": "CAM-24 [Ridge Terminal Radar Post]",
        "sector": "Sector Delta",
        "location": "BP-24",
        "status": "NOT CONNECTED",
        "stream_url": "",
        "source_type": "rtsp",
        "latitude": 34.1335,
        "longitude": 74.8535,
        "fps": 25,
        "enabled": True
    }
]

class CameraService:
    @staticmethod
    def ensure_24_cameras(db: Session) -> List[Camera]:
        """
        Guarantees exactly 24 CCTV camera slots in the system.
        Preserves existing cameras.
        Sets disconnected cameras to 'OFFLINE'.
        Adds new cameras initialized to 'NOT CONNECTED' until total count is 24.
        Idempotent: does not duplicate cameras on repeated runs.
        """
        existing = db.query(Camera).all()
        existing_map = {c.id: c for c in existing}

        # 1. Update any disconnected cameras if marked ONLINE erroneously
        for cid, cam in existing_map.items():
            if cid.startswith("CAM-UP-"):
                if cam.status not in ["OFFLINE", "STOPPED", "ERROR"]:
                    cam.status = "OFFLINE"
                if "E2E" in cam.name:
                    cam.name = f"{cid} [Forward Outpost Watch - Offline]"

        # 2. Add cameras from standard fleet until count is 24
        added = False
        for cam_data in ALL_STANDARD_CAMERAS_CONFIG:
            if len(existing_map) >= 24:
                break
            if cam_data["id"] not in existing_map:
                new_cam = Camera(
                    id=cam_data["id"],
                    name=cam_data["name"],
                    stream_url=cam_data["stream_url"],
                    source_type=cam_data["source_type"],
                    status=cam_data["status"],
                    sector=cam_data["sector"],
                    location=cam_data["location"],
                    latitude=cam_data["latitude"],
                    longitude=cam_data["longitude"],
                    fps=cam_data["fps"],
                    enabled=cam_data["enabled"],
                    created_at=datetime.utcnow()
                )
                db.add(new_cam)
                existing_map[cam_data["id"]] = new_cam
                added = True

        if added or any(cid.startswith("CAM-UP-") for cid in existing_map):
            db.commit()

        return db.query(Camera).all()

    @staticmethod
    def get_all(db: Session) -> List[Camera]:
        return db.query(Camera).all()

    @staticmethod
    def get_by_id(db: Session, camera_id: str) -> Optional[Camera]:
        return db.query(Camera).filter((Camera.id == camera_id) | (Camera.name == camera_id)).first()

    @staticmethod
    def create(db: Session, camera_in: CameraCreate) -> Camera:
        camera = Camera(
            name=camera_in.name,
            stream_url=camera_in.stream_url,
            source_type=camera_in.source_type,
            status="CREATED",
            ip_address=camera_in.ip_address,
            port=camera_in.port or 554,
            username=camera_in.username,
            substream_url=camera_in.substream_url,
            enabled=True if camera_in.enabled is None else camera_in.enabled,
            sector=camera_in.sector,
            location=camera_in.location,
            latitude=camera_in.latitude,
            longitude=camera_in.longitude,
            fps=camera_in.fps or 30
        )
        db.add(camera)
        db.commit()
        db.refresh(camera)
        return camera

    @staticmethod
    def update(db: Session, camera: Camera, camera_in: CameraUpdate) -> Camera:
        for field, value in camera_in.model_dump(exclude_unset=True).items():
            if hasattr(camera, field):
                setattr(camera, field, value)
        camera.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(camera)
        return camera

    @staticmethod
    def delete(db: Session, camera: Camera) -> None:
        from app.workers.video_worker import worker_manager
        worker_manager.stop_worker(camera.id)
        db.delete(camera)
        db.commit()

    @staticmethod
    def get_health_map(db: Session) -> Dict[str, Any]:
        from app.workers.video_worker import worker_manager
        cameras = CameraService.get_all(db)
        health_items = {}
        for c in cameras:
            is_active = worker_manager.is_running(c.id)
            telem = worker_manager.get_telemetry(c.id) if is_active else {}
            if is_active:
                state = "healthy"
            elif not c.stream_url or c.status == "NOT CONNECTED":
                state = "not_connected"
            elif c.status in ["degraded", "MAINTENANCE"]:
                state = "degraded"
            else:
                state = "offline"

            last_frame = c.last_seen_at.isoformat() if c.last_seen_at else (datetime.utcnow().isoformat() if is_active else "")
            health_items[c.id] = {
                "camera_id": c.id,
                "state": state,
                "fps": float(telem.get("fps", 0.0)),
                "last_frame_time": last_frame,
                "active_tracks": int(telem.get("active_tracks", 0)),
                "latency_ms": telem.get("latency_ms"),
                "packet_loss": None,
                "temperature_c": None,
                "resolution": telem.get("resolution")
            }
        return {
            "cameras": health_items,
            "total": len(cameras)
        }
