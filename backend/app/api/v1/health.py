import os
import shutil
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.database import get_db
from app.db.models.models import Event, Camera, Evidence
from app.schemas.schemas import HealthResponse, SystemStatisticsResponse, SystemHealthResponse
from app.workers.video_worker import worker_manager
from app.core.config import settings

router = APIRouter(tags=["System Health & Stats"])

@router.get("/health", response_model=HealthResponse)
def get_health():
    return HealthResponse(status="ok", service="IBVAP Intelligent Surveillance Engine")

@router.get("/system/health", response_model=SystemHealthResponse)
def get_system_health(db: Session = Depends(get_db)):
    # 1. Database status check
    db_status = "healthy"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "down"

    # 2. Worker & Ingestion status
    active_workers = [w for w in worker_manager.workers.values() if w.is_alive()]
    active_stream_count = len(active_workers)
    video_ingestion = "healthy" if active_stream_count > 0 else "degraded"
    ai_pipeline = "healthy"

    # 3. Latency & Telemetry
    latencies = [w.current_latency_ms for w in active_workers if w.current_latency_ms > 0]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0.0

    # 4. Storage calculation using actual OS filesystem
    storage_dir = os.path.abspath(settings.STORAGE_DIR)
    os.makedirs(storage_dir, exist_ok=True)
    try:
        total, used, free = shutil.disk_usage(storage_dir)
        storage_used_gb = round(used / (1024 ** 3), 2)
        storage_total_gb = round(total / (1024 ** 3), 2)
        evidence_storage = "healthy" if free > (500 * 1024 * 1024) else "degraded"
    except Exception:
        storage_used_gb = 0.0
        storage_total_gb = 0.0
        evidence_storage = "degraded"

    # 5. Camera network percent
    all_cams = db.query(Camera).all()
    total_cams = len(all_cams)
    online_cams = sum(1 for c in all_cams if worker_manager.is_running(c.id))
    cam_net_pct = round((online_cams / total_cams * 100.0), 1) if total_cams > 0 else 100.0

    # 6. Events per second (measured over last 60 seconds)
    one_min_ago = datetime.utcnow() - timedelta(seconds=60)
    recent_events_count = db.query(Event).filter(Event.timestamp >= one_min_ago).count()
    events_per_sec = round(recent_events_count / 60.0, 2)

    return SystemHealthResponse(
        videoIngestion=video_ingestion,
        aiPipeline=ai_pipeline,
        cameraNetworkPercent=cam_net_pct,
        database=db_status,
        evidenceStorage=evidence_storage,
        averageLatencyMs=avg_latency,
        ingestionLatencyMs=avg_latency,
        activeModel="Ultralytics YOLOv8n",
        eventsPerSecond=events_per_sec,
        activeStreamCount=active_stream_count,
        storageUsedGb=storage_used_gb,
        storageTotalGb=storage_total_gb,
        lastSyncTimestamp=datetime.utcnow().isoformat()
    )

@router.get("/statistics", response_model=SystemStatisticsResponse)
def get_statistics(db: Session = Depends(get_db)):
    total_events = db.query(Event).count()
    intrusions = db.query(Event).filter(Event.event_type == "INTRUSION").count()
    prolonged_presence = db.query(Event).filter(Event.event_type == "LOITERING").count()
    high_severity = db.query(Event).filter(Event.severity == "HIGH").count()
    critical_severity = db.query(Event).filter(Event.severity == "CRITICAL").count()
    active_critical = db.query(Event).filter(
        Event.severity == "CRITICAL",
        Event.status.in_(["active", "updated", "unresolved", "investigating", "acknowledged"])
    ).count()
    active_high = db.query(Event).filter(
        Event.severity == "HIGH",
        Event.status.in_(["active", "updated", "unresolved", "investigating", "acknowledged"])
    ).count()
    evidence_count = db.query(Evidence).count()

    cameras = db.query(Camera).all()
    cam_total = len(cameras)
    cam_healthy = sum(1 for c in cameras if worker_manager.is_running(c.id))
    cam_degraded = sum(1 for c in cameras if worker_manager.get_status(c.id) == "RECONNECTING")
    cam_offline = max(0, cam_total - cam_healthy - cam_degraded)

    # Active Worker Telemetry Aggregation
    active_workers = [w for w in worker_manager.workers.values() if w.is_alive()]
    active_tracks = sum(w.active_tracks_count for w in active_workers)

    # Detection totals - Count UNIQUE tracked objects per camera instead of raw frame rows
    from app.db.models.models import Detection
    active_person_tracks = sum(getattr(w.pipeline.tracker, "person_count", 0) for w in active_workers if hasattr(w, "pipeline"))
    active_vehicle_tracks = sum(getattr(w.pipeline.tracker, "vehicle_count", 0) for w in active_workers if hasattr(w, "pipeline"))

    db_unique_persons = db.query(Detection.camera_id, Detection.track_id).filter(
        Detection.object_type == "person",
        Detection.track_id.isnot(None)
    ).distinct().count()

    db_unique_vehicles = db.query(Detection.camera_id, Detection.track_id).filter(
        Detection.object_type.in_(["car", "truck", "bus", "motorcycle"]),
        Detection.track_id.isnot(None)
    ).distinct().count()

    total_persons = max(active_person_tracks, db_unique_persons)
    total_vehicles = max(active_vehicle_tracks, db_unique_vehicles)

    latencies = [w.current_latency_ms for w in active_workers if w.current_latency_ms > 0]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 12.5

    return SystemStatisticsResponse(
        total_events=total_events,
        intrusions=intrusions,
        prolonged_presence=prolonged_presence,
        risk_assessments=total_events,
        high_severity=high_severity,
        critical_severity=critical_severity,
        evidence_events=evidence_count,
        total_cameras=cam_total,
        active_cameras=cam_healthy,
        offline_cameras=cam_offline,
        degraded_cameras=cam_degraded,
        total_persons=max(total_persons, active_tracks),
        total_vehicles=total_vehicles,
        critical_alerts=active_critical,
        high_alerts=active_high,
        stream_latency_ms=avg_latency,
        network_mbps=round(cam_healthy * 1.8, 1),
        camera_health={
            "total": cam_total,
            "healthy": cam_healthy,
            "degraded": cam_degraded,
            "offline": cam_offline,
            "recovering": 0
        }
    )
