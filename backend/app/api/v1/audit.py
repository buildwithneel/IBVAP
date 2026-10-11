from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models.models import AuditRecord
from app.services.audit_service import AuditService
from app.schemas.schemas import AuditListResponse, AuditVerificationResponse, AuditRecordResponse, AuditActionLogCreate

router = APIRouter(prefix="/audit", tags=["Audit Chain"])

@router.get("", response_model=AuditListResponse)
def get_audit_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(AuditRecord)
    total = query.count()
    records = query.order_by(AuditRecord.sequence_number.desc()).offset(offset).limit(limit).all()

    return AuditListResponse(
        records=[AuditRecordResponse.model_validate(r) for r in records],
        total=total,
        limit=limit,
        offset=offset
    )

@router.post("", response_model=AuditRecordResponse)
def log_audit_action(payload: AuditActionLogCreate, db: Session = Depends(get_db)):
    event_id = payload.targetId or payload.id or f"ACT-{int(datetime.utcnow().timestamp())}"
    rec = AuditService.append_event(
        db=db,
        event_id=event_id,
        event_type=payload.action or "OPERATOR_ACTION",
        payload={
            "operator_id": payload.operatorId,
            "operator_name": payload.operatorName,
            "action": payload.action,
            "target_type": payload.targetType,
            "target_id": payload.targetId,
            "details": payload.details,
            "ip_address": payload.ipAddress,
            "status": payload.status
        },
        operator_id=payload.operatorId,
        operator_name=payload.operatorName,
        operator_role=payload.operatorRole,
        action=payload.action,
        target_type=payload.targetType,
        target_id=payload.targetId,
        details=payload.details,
        status=payload.status or "SUCCESS"
    )
    return AuditRecordResponse.model_validate(rec)

@router.get("/verify", response_model=AuditVerificationResponse)
def verify_audit_chain(db: Session = Depends(get_db)):
    report = AuditService.verify_chain(db)
    return AuditVerificationResponse(**report)

