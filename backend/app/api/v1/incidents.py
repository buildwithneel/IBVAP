from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List, Union
from datetime import datetime

from app.db.database import get_db
from app.db.models.models import Incident, IncidentNote, Camera, Event, Evidence, AuditRecord
from app.schemas.schemas import (
    IncidentResponse, IncidentListResponse, IncidentNoteCreate, IncidentNoteResponse,
    IncidentExplanationStepSchema, IncidentTimelineEventSchema
)
from app.services.audit_service import AuditService

router = APIRouter(prefix="/incidents", tags=["Incidents"])

def _format_incident(inc: Incident, db: Session) -> IncidentResponse:
    cam = inc.camera or db.query(Camera).filter(Camera.id == inc.camera_id).first()
    cam_name = cam.name if cam else inc.camera_id
    cam_location = (cam.location if cam else None) or "Perimeter Sector"
    cam_sector = (cam.sector if cam else None) or "Sector 01"

    # Notes
    formatted_notes = [
        IncidentNoteResponse(
            id=n.id,
            author=n.author,
            role=n.role,
            timestamp=n.created_at.strftime("%H:%M:%S") if n.created_at else "",
            text=n.text
        )
        for n in inc.notes
    ]

    # Timeline from real event & audit records
    timeline = [
        IncidentTimelineEventSchema(
            id=f"TL-DET-{inc.id[:8]}",
            timestamp=inc.detected_at.strftime("%H:%M:%S") if inc.detected_at else "",
            title="AI Perimeter Target Detected",
            description=f"Ultralytics YOLO confirmed {inc.object_class} (confidence: {int(inc.confidence * 100)}%).",
            actor="AI Vision Engine",
            type="detection"
        ),
        IncidentTimelineEventSchema(
            id=f"TL-TRIG-{inc.id[:8]}",
            timestamp=inc.detected_at.strftime("%H:%M:%S") if inc.detected_at else "",
            title=f"Rule Triggered: {inc.type}",
            description=f"Ray-casting polygon evaluation confirmed breach on camera {cam_name}.",
            actor="Rule Engine",
            type="ai_trigger"
        )
    ]

    # Add operator actions from audit records if available
    audit_records = db.query(AuditRecord).filter(
        (AuditRecord.target_id == inc.id) | (AuditRecord.event_id == inc.event_id)
    ).order_by(AuditRecord.sequence_number.asc()).all()

    for ar in audit_records:
        if ar.action:
            action_type = "escalation" if "ESCALATE" in ar.action else "operator_action"
            timeline.append(
                IncidentTimelineEventSchema(
                    id=f"TL-AUD-{ar.sequence_number}",
                    timestamp=ar.timestamp.strftime("%H:%M:%S") if ar.timestamp else "",
                    title=ar.action.replace("_", " ").title(),
                    description=ar.details or "",
                    actor=ar.operator_name or ar.operator_id or "Operator",
                    type=action_type
                )
            )

    # Explanation Steps
    explanation = [
        IncidentExplanationStepSchema(
            stepNumber=1,
            title="Real-Time Frame Extraction",
            description="Frame extracted from video ingestion pipeline and preprocessed with OpenCV.",
            timestamp=inc.detected_at.strftime("%H:%M:%S") if inc.detected_at else "",
            confidence=round(inc.confidence, 2),
            status="normal"
        ),
        IncidentExplanationStepSchema(
            stepNumber=2,
            title=f"YOLO Object Detection ({inc.object_class})",
            description=f"Ultralytics YOLO inference identified {inc.object_class} with confidence {round(inc.confidence, 2)}.",
            timestamp=inc.detected_at.strftime("%H:%M:%S") if inc.detected_at else "",
            confidence=round(inc.confidence, 2),
            status="flagged"
        ),
        IncidentExplanationStepSchema(
            stepNumber=3,
            title=f"Zone Rule Evaluated ({inc.type})",
            description=f"Point-in-polygon transition confirmed inside zone for camera {cam_name}.",
            timestamp=inc.detected_at.strftime("%H:%M:%S") if inc.detected_at else "",
            confidence=round(inc.confidence, 2),
            status="trigger"
        )
    ]

    return IncidentResponse(
        id=inc.id,
        title=inc.title,
        alertId=inc.event_id or inc.id,
        type=inc.type,
        severity=inc.severity.lower(),
        cameraId=inc.camera_id,
        cameraName=cam_name,
        location=cam_location,
        sector=cam_sector,
        detectedAt=inc.detected_at.isoformat() if inc.detected_at else datetime.utcnow().isoformat(),
        status=inc.status,
        objectClass=inc.object_class,
        confidence=round(inc.confidence * 100, 1) if inc.confidence <= 1.0 else inc.confidence,
        assignedTo=inc.assigned_to,
        priority=inc.priority,
        explanationSteps=explanation,
        timeline=timeline,
        notes=formatted_notes,
        evidenceId=inc.evidence_id
    )

@router.get("", response_model=Union[IncidentListResponse, List[IncidentResponse]])
def list_incidents(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    camera_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Incident)
    if status and status != 'all':
        query = query.filter(Incident.status == status.lower())
    if severity and severity != 'all':
        query = query.filter(Incident.severity == severity.lower())
    if camera_id and camera_id != 'all':
        query = query.filter(Incident.camera_id == camera_id)

    total = query.count()
    items = query.order_by(Incident.detected_at.desc()).offset(offset).limit(limit).all()

    formatted = [_format_incident(inc, db) for inc in items]
    return formatted

@router.get("/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: str, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(
        (Incident.id == incident_id) | (Incident.id == f"INC-{incident_id}") | (Incident.event_id == incident_id)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")
    return _format_incident(inc, db)

@router.patch("/{incident_id}/acknowledge")
def acknowledge_incident(incident_id: str, payload: dict, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(
        (Incident.id == incident_id) | (Incident.id == f"INC-{incident_id}") | (Incident.event_id == incident_id)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    actor = payload.get("actor", "OPERATOR")
    inc.status = "under_review"
    inc.assigned_to = actor
    db.commit()

    # Append to cryptographic audit chain
    AuditService.append_event(
        db=db,
        event_id=inc.event_id or inc.id,
        event_type="INCIDENT_ACKNOWLEDGED",
        payload={
            "incident_id": inc.id,
            "action": "ACKNOWLEDGE_INCIDENT",
            "actor": actor,
            "status": inc.status,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

    return _format_incident(inc, db)

@router.patch("/{incident_id}/escalate")
def escalate_incident(incident_id: str, payload: dict, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(
        (Incident.id == incident_id) | (Incident.id == f"INC-{incident_id}") | (Incident.event_id == incident_id)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    actor = payload.get("actor", "SUPERVISOR")
    reason = payload.get("reason", "Escalated by command desk.")
    inc.status = "escalated"
    inc.priority = max(inc.priority or 1, 2)
    db.commit()

    AuditService.append_event(
        db=db,
        event_id=inc.event_id or inc.id,
        event_type="INCIDENT_ESCALATED",
        payload={
            "incident_id": inc.id,
            "action": "ESCALATE_INCIDENT",
            "actor": actor,
            "reason": reason,
            "status": inc.status,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

    return _format_incident(inc, db)

@router.patch("/{incident_id}/resolve")
def resolve_incident(incident_id: str, payload: dict, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(
        (Incident.id == incident_id) | (Incident.id == f"INC-{incident_id}") | (Incident.event_id == incident_id)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    actor = payload.get("actor", "SUPERVISOR")
    resolution = payload.get("resolutionSummary", "Incident resolved and cleared.")
    inc.status = "resolved"
    db.commit()

    # Also resolve linked event
    if inc.event_id:
        ev = db.query(Event).filter(Event.id == inc.event_id).first()
        if ev:
            ev.status = "resolved"
            db.commit()

    AuditService.append_event(
        db=db,
        event_id=inc.event_id or inc.id,
        event_type="INCIDENT_RESOLVED",
        payload={
            "incident_id": inc.id,
            "action": "RESOLVE_INCIDENT",
            "actor": actor,
            "resolution": resolution,
            "status": inc.status,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

    return _format_incident(inc, db)

@router.post("/{incident_id}/notes", status_code=status.HTTP_201_CREATED)
def add_incident_note(incident_id: str, payload: IncidentNoteCreate, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(
        (Incident.id == incident_id) | (Incident.id == f"INC-{incident_id}") | (Incident.event_id == incident_id)
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found.")

    note = IncidentNote(
        incident_id=inc.id,
        author=payload.author,
        role=payload.role,
        text=payload.text,
        created_at=datetime.utcnow()
    )
    db.add(note)
    db.commit()

    AuditService.append_event(
        db=db,
        event_id=inc.event_id or inc.id,
        event_type="INCIDENT_NOTE_ADDED",
        payload={
            "incident_id": inc.id,
            "action": "APPEND_CASE_NOTE",
            "author": payload.author,
            "role": payload.role,
            "text": payload.text[:100],
            "timestamp": datetime.utcnow().isoformat()
        }
    )

    return {
        "message": "Note added successfully",
        "note_id": note.id,
        "text": note.text,
        "author": note.author,
        "role": note.role
    }
