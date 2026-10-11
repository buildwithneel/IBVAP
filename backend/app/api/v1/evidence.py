from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.db.models.models import Evidence
from app.schemas.schemas import EvidenceResponse

router = APIRouter(prefix="/evidence", tags=["Evidence"])

@router.get("", response_model=List[EvidenceResponse])
def list_evidence(db: Session = Depends(get_db)):
    items = db.query(Evidence).order_by(Evidence.created_at.desc()).all()
    res = []
    for item in items:
        res.append(EvidenceResponse(
            id=item.id,
            event_id=item.event_id,
            image_path=item.image_path,
            plate_image_path=item.plate_image_path,
            plate_image_url=item.plate_image_path,
            video_path=item.video_path,
            snapshot_url=item.image_path,
            sha256=item.sha256,
            plate_sha256=item.plate_sha256,
            capture_status="SUCCESS" if (item.image_path or item.plate_image_path) else "FAILED",
            file_size_bytes=item.file_size_bytes,
            created_at=item.created_at
        ))
    return res

@router.get("/{evidence_id}", response_model=EvidenceResponse)
def get_evidence(evidence_id: str, db: Session = Depends(get_db)):
    clean_id = evidence_id.replace("EVD-", "")
    item = db.query(Evidence).filter((Evidence.id == clean_id) | (Evidence.id == evidence_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"Evidence with ID '{evidence_id}' not found.")

    return EvidenceResponse(
        id=item.id,
        event_id=item.event_id,
        image_path=item.image_path,
        plate_image_path=item.plate_image_path,
        plate_image_url=item.plate_image_path,
        video_path=item.video_path,
        snapshot_url=item.image_path,
        sha256=item.sha256,
        plate_sha256=item.plate_sha256,
        capture_status="SUCCESS" if (item.image_path or item.plate_image_path) else "FAILED",
        file_size_bytes=item.file_size_bytes,
        created_at=item.created_at
    )

@router.post("/{evidence_id}/verify")
def verify_evidence_hash(evidence_id: str, db: Session = Depends(get_db)):
    from app.services.evidence_service import EvidenceService
    return EvidenceService.verify_evidence(db, evidence_id)

@router.get("/incident/{incident_id}", response_model=EvidenceResponse)
def get_evidence_by_incident(incident_id: str, db: Session = Depends(get_db)):
    from app.db.models.models import Incident, Event
    clean_inc_id = incident_id.replace("INC-", "").replace("IR-", "")
    inc = db.query(Incident).filter(
        (Incident.id == clean_inc_id) |
        (Incident.id == incident_id) |
        (Incident.event_id == incident_id) |
        (Incident.event_id == clean_inc_id)
    ).first()

    item = None
    if inc and inc.evidence_id:
        item = db.query(Evidence).filter(Evidence.id == inc.evidence_id).first()

    if not item:
        # Also check directly by Event ID or Evidence ID
        item = db.query(Evidence).filter(
            (Evidence.event_id == incident_id) |
            (Evidence.event_id == clean_inc_id) |
            (Evidence.id == incident_id) |
            (Evidence.id == clean_inc_id)
        ).first()

    if not item and inc and inc.event_id:
        item = db.query(Evidence).filter(Evidence.event_id == inc.event_id).first()

    if not item:
        raise HTTPException(status_code=404, detail=f"No evidence found for incident '{incident_id}'.")

    return EvidenceResponse(
        id=item.id,
        event_id=item.event_id,
        image_path=item.image_path,
        plate_image_path=item.plate_image_path,
        plate_image_url=item.plate_image_path,
        video_path=item.video_path,
        snapshot_url=item.image_path,
        sha256=item.sha256,
        plate_sha256=item.plate_sha256,
        capture_status="SUCCESS" if (item.image_path or item.plate_image_path) else "FAILED",
        file_size_bytes=item.file_size_bytes,
        created_at=item.created_at
    )

