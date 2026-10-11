from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from app.db.database import get_db
from app.db.models.models import Detection
from app.schemas.schemas import DetectionResponse

router = APIRouter(prefix="/detections", tags=["Detections"])

@router.get("", response_model=dict)
def list_detections(
    camera_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Detection)
    if camera_id:
        query = query.filter(Detection.camera_id == camera_id)

    total = query.count()
    items = query.order_by(Detection.timestamp.desc()).offset(offset).limit(limit).all()

    return {
        "detections": [DetectionResponse.model_validate(d) for d in items],
        "total": total,
        "limit": limit,
        "offset": offset
    }
