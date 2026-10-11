from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from app.db.database import get_db
from app.services.zone_service import ZoneService
from app.ai.boundary_detector import AIBoundaryDetector
from app.workers.video_worker import worker_manager
from app.schemas.schemas import (
    ZoneResponse,
    ZoneCreate,
    ZoneUpdate,
    ZoneConfirmRequest,
    BoundarySuggestionResponse,
    RuleSettingsSchema
)

router = APIRouter(tags=["Zones & Virtual Fencing"])

# In-memory / persisted global suspicious activity rules settings
GLOBAL_RULE_SETTINGS = RuleSettingsSchema()

@router.get("/zones", response_model=List[ZoneResponse])
def list_zones(
    camera_id: Optional[str] = None,
    include_unconfirmed: bool = Query(True, description="Include draft and pending confirmation zones"),
    db: Session = Depends(get_db)
):
    if camera_id:
        return ZoneService.get_by_camera(db, camera_id, include_unconfirmed=include_unconfirmed)
    return ZoneService.get_all(db, include_unconfirmed=include_unconfirmed)

@router.post("/zones", response_model=ZoneResponse, status_code=status.HTTP_201_CREATED)
def create_zone(payload: ZoneCreate, db: Session = Depends(get_db)):
    if len(payload.polygon) < 2:
        raise HTTPException(
            status_code=400,
            detail="Zone must contain at least 2 points (for a LINE) or 3 points (for a POLYGON)."
        )
    return ZoneService.create(db, payload)

@router.get("/zones/{zone_id}", response_model=ZoneResponse)
def get_zone(zone_id: str, db: Session = Depends(get_db)):
    zone = ZoneService.get_by_id(db, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    return zone

@router.post("/zones/{zone_id}/confirm", response_model=ZoneResponse)
def confirm_zone(zone_id: str, payload: ZoneConfirmRequest, db: Session = Depends(get_db)):
    """Human-in-the-Loop Confirmation workflow endpoint to activate a virtual fence."""
    updated = ZoneService.confirm_zone(db, zone_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    return updated

@router.post("/zones/{zone_id}/reject", response_model=ZoneResponse)
def reject_zone(zone_id: str, reason: Optional[str] = None, db: Session = Depends(get_db)):
    """HITL rejection endpoint for AI boundary suggestions."""
    updated = ZoneService.reject_zone(db, zone_id, reason)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    return updated

@router.put("/zones/{zone_id}", response_model=ZoneResponse)
def update_zone(zone_id: str, payload: ZoneUpdate, db: Session = Depends(get_db)):
    """Updates zone geometry or parameters. Geometry edits revert status to PENDING_CONFIRMATION."""
    updated = ZoneService.update_zone(db, zone_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    return updated

@router.delete("/zones/{zone_id}")
def delete_zone(zone_id: str, db: Session = Depends(get_db)):
    deleted = ZoneService.delete(db, zone_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Zone with ID '{zone_id}' not found.")
    return {"message": "Virtual fence zone deleted successfully."}

@router.post("/cameras/{camera_id}/detect-boundaries", response_model=BoundarySuggestionResponse)
def detect_camera_boundaries(camera_id: str):
    """
    AI-Assisted Boundary Detection endpoint.
    Analyzes the latest frame from the specified active camera feed to suggest structural boundary draft candidates.
    """
    worker = worker_manager.get_worker(camera_id)
    frame = None
    if worker and len(worker.frame_buffer) > 0:
        frame = worker.frame_buffer[-1]

    raw_res = AIBoundaryDetector.analyze_frame_boundaries(frame)
    return BoundarySuggestionResponse(
        camera_id=camera_id,
        suggestions=raw_res["suggestions"],
        method_used=raw_res["method_used"],
        total=raw_res["total"],
        timestamp=raw_res["timestamp"]
    )

@router.get("/rules/settings", response_model=RuleSettingsSchema)
def get_rule_settings():
    """Gets current suspicious activity rule settings."""
    return GLOBAL_RULE_SETTINGS

@router.put("/rules/settings", response_model=RuleSettingsSchema)
def update_rule_settings(settings_in: RuleSettingsSchema):
    """Updates suspicious activity rule settings."""
    global GLOBAL_RULE_SETTINGS
    GLOBAL_RULE_SETTINGS = settings_in
    return GLOBAL_RULE_SETTINGS
