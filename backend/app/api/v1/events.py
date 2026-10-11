from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Union
from datetime import datetime, timezone
from app.db.database import get_db
from app.db.models.models import Event, Incident
from app.schemas.schemas import EventResponse, EventListResponse, AlertListResponse

router = APIRouter(tags=["Events & Alerts"])

@router.get("/events", response_model=Union[EventListResponse, List[EventResponse]])
def list_events(
    camera_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Event)
    if camera_id:
        query = query.filter(Event.camera_id == camera_id)
    if event_type:
        query = query.filter(Event.event_type == event_type.upper())
    if severity:
        query = query.filter(Event.severity == severity.upper())

    total = query.count()
    items = query.order_by(Event.timestamp.desc()).offset(offset).limit(limit).all()

    return EventListResponse(
        events=[_format_event(e) for e in items],
        total=total,
        limit=limit,
        offset=offset
    )

@router.get("/alerts", response_model=Union[AlertListResponse, List[EventResponse]])
def list_alerts(
    camera_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Event)
    if camera_id:
        query = query.filter(Event.camera_id == camera_id)
    if status:
        query = query.filter(Event.status == status.lower())

    total = query.count()
    items = query.order_by(Event.timestamp.desc()).offset(offset).limit(limit).all()

    return AlertListResponse(
        alerts=[_format_event(e) for e in items],
        total=total,
        limit=limit,
        offset=offset
    )

@router.get("/events/{event_id}", response_model=EventResponse)
def get_event(event_id: str, db: Session = Depends(get_db)):
    ev = db.query(Event).filter((Event.id == event_id) | (Event.id == f"EVT-{event_id}")).first()
    if not ev:
        raise HTTPException(status_code=404, detail=f"Event with ID '{event_id}' not found.")
    return _format_event(ev)

@router.patch("/events/{event_id}/status")
@router.patch("/alerts/{event_id}/status")
def update_event_status(event_id: str, payload: dict, db: Session = Depends(get_db)):
    ev = db.query(Event).filter((Event.id == event_id) | (Event.id == f"EVT-{event_id}")).first()
    if not ev:
        raise HTTPException(status_code=404, detail=f"Event with ID '{event_id}' not found.")

    new_status = payload.get("status", "acknowledged")
    ev.status = new_status
    db.commit()
    db.refresh(ev)

    from app.services.event_service import EventService
    if new_status == "resolved":
        EventService.resolve_event_lifecycle(ev.id, db)

    formatted = _format_event(ev)
    formatted_dict = formatted.model_dump() if hasattr(formatted, "model_dump") else formatted.dict()
    alert_payload = {
        **formatted_dict,
        "id": ev.id,
        "eventId": ev.id,
        "status": ev.status,
        "severity": (ev.severity or "critical").lower(),
        "cameraCode": formatted.camera_name,
        "cameraName": formatted.camera_name,
        "title": f"{ev.event_type.replace('_', ' ').title()} - {formatted.camera_name}",
        "timestamp": ev.timestamp.isoformat() if ev.timestamp else datetime.now(timezone.utc).isoformat()
    }

    EventService.broadcast_sync({
        "type": "alert.status_changed",
        "event_id": ev.id,
        "id": ev.id,
        "status": ev.status,
        "payload": alert_payload,
        "alert": alert_payload,
        "event": alert_payload
    })

    return {"message": "Status updated successfully", "event_id": ev.id, "status": ev.status}

@router.patch("/events/{event_id}/acknowledge")
@router.patch("/alerts/{event_id}/acknowledge")
def acknowledge_event(event_id: str, payload: dict = None, db: Session = Depends(get_db)):
    ev = db.query(Event).filter((Event.id == event_id) | (Event.id == f"EVT-{event_id}")).first()
    if not ev:
        raise HTTPException(status_code=404, detail=f"Event with ID '{event_id}' not found.")

    ev.status = "acknowledged"
    db.commit()
    db.refresh(ev)

    inc = db.query(Incident).filter(Incident.event_id == ev.id).first()
    if inc:
        inc.status = "under_review"
        db.commit()

    formatted = _format_event(ev)
    formatted_dict = formatted.model_dump() if hasattr(formatted, "model_dump") else formatted.dict()
    alert_payload = {
        **formatted_dict,
        "id": ev.id,
        "eventId": ev.id,
        "status": "acknowledged",
        "severity": (ev.severity or "critical").lower(),
        "cameraCode": formatted.camera_name,
        "cameraName": formatted.camera_name,
        "title": f"{ev.event_type.replace('_', ' ').title()} - {formatted.camera_name}",
        "timestamp": ev.timestamp.isoformat() if ev.timestamp else datetime.now(timezone.utc).isoformat()
    }

    from app.services.event_service import EventService
    EventService.broadcast_sync({
        "type": "alert.status_changed",
        "event_id": ev.id,
        "id": ev.id,
        "status": "acknowledged",
        "payload": alert_payload,
        "alert": alert_payload,
        "event": alert_payload
    })

    return formatted

@router.patch("/events/{event_id}/resolve")
@router.patch("/alerts/{event_id}/resolve")
def resolve_event(event_id: str, payload: dict = None, db: Session = Depends(get_db)):
    ev = db.query(Event).filter((Event.id == event_id) | (Event.id == f"EVT-{event_id}")).first()
    if not ev:
        raise HTTPException(status_code=404, detail=f"Event with ID '{event_id}' not found.")

    ev.status = "resolved"
    db.commit()
    db.refresh(ev)

    inc = db.query(Incident).filter(Incident.event_id == ev.id).first()
    if inc:
        inc.status = "resolved"
        db.commit()

    from app.services.event_service import EventService
    EventService.resolve_event_lifecycle(ev.id, db)

    formatted = _format_event(ev)
    formatted_dict = formatted.model_dump() if hasattr(formatted, "model_dump") else formatted.dict()
    alert_payload = {
        **formatted_dict,
        "id": ev.id,
        "eventId": ev.id,
        "status": "resolved",
        "severity": (ev.severity or "critical").lower(),
        "cameraCode": formatted.camera_name,
        "cameraName": formatted.camera_name,
        "title": f"{ev.event_type.replace('_', ' ').title()} - {formatted.camera_name}",
        "timestamp": ev.timestamp.isoformat() if ev.timestamp else datetime.now(timezone.utc).isoformat()
    }

    EventService.broadcast_sync({
        "type": "alert.status_changed",
        "event_id": ev.id,
        "id": ev.id,
        "status": "resolved",
        "payload": alert_payload,
        "alert": alert_payload,
        "event": alert_payload
    })

    return formatted

def _format_event(e: Event) -> EventResponse:
    meta = e.event_metadata or {}
    evidence_data = None
    plate_image_url = None
    snapshot_url = None
    plate_number = (meta.get("object") or {}).get("plate_number") if meta.get("object") else None

    if e.evidence:
        snapshot_url = e.evidence.image_path
        plate_image_url = e.evidence.plate_image_path
        evidence_data = {
            "id": e.evidence.id,
            "event_id": e.id,
            "image_path": e.evidence.image_path,
            "plate_image_path": e.evidence.plate_image_path,
            "plate_image_url": e.evidence.plate_image_path,
            "snapshot_url": e.evidence.image_path,
            "video_path": e.evidence.video_path,
            "sha256": e.evidence.sha256,
            "plate_sha256": e.evidence.plate_sha256,
            "plate_number": plate_number,
            "capture_status": "SUCCESS" if (e.evidence.image_path or e.evidence.plate_image_path) else "FAILED",
            "file_size_bytes": e.evidence.file_size_bytes,
            "created_at": e.evidence.created_at
        }
    elif meta.get("evidence"):
        ev_meta = meta["evidence"]
        snapshot_url = ev_meta.get("snapshot_url")
        plate_image_url = ev_meta.get("plate_image_url")
        if not plate_number:
            plate_number = ev_meta.get("plate_number")
        evidence_data = {
            "id": ev_meta.get("evidence_id", e.id),
            "event_id": e.id,
            "image_path": snapshot_url,
            "plate_image_path": plate_image_url,
            "plate_image_url": plate_image_url,
            "snapshot_url": snapshot_url,
            "sha256": ev_meta.get("sha256", ""),
            "plate_sha256": ev_meta.get("plate_sha256"),
            "plate_number": plate_number,
            "capture_status": ev_meta.get("capture_status", "SUCCESS" if snapshot_url else "UNAVAILABLE"),
            "file_size_bytes": ev_meta.get("file_size_bytes", 0),
            "created_at": e.timestamp
        }

    cam_name = e.camera.name if e.camera else f"CAM-{e.camera_id[:4]}"
    cam_sector = e.camera.sector if e.camera else "Sector Alpha"
    evidence_status = (
        evidence_data.get("capture_status")
        if evidence_data
        else ("SUCCESS" if snapshot_url or plate_image_url else "UNAVAILABLE")
    )

    return EventResponse(
        id=e.id,
        event_id=e.id,
        camera_id=e.camera_id,
        camera_name=cam_name,
        sector=cam_sector,
        event_type=e.event_type,
        severity=e.severity,
        risk_score=e.risk_score or 0,
        timestamp=e.timestamp,
        track_id=e.track_id,
        confidence=e.confidence or 0.0,
        plate_number=plate_number,
        plate_image_url=plate_image_url,
        snapshot_url=snapshot_url,
        evidence_status=evidence_status,
        object=meta.get("object"),
        zone=meta.get("zone"),
        rule=meta.get("rule"),
        context=meta.get("context"),
        evidence=evidence_data,
        previous_hash=e.previous_hash,
        event_hash=e.event_hash,
        status=e.status or "active",
        created_at=e.created_at
    )
