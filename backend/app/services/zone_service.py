from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
from app.db.models.models import Zone
from app.schemas.schemas import ZoneCreate, ZoneUpdate, ZoneConfirmRequest

class ZoneService:
    @staticmethod
    def get_by_camera(db: Session, camera_id: str, include_unconfirmed: bool = True) -> List[Zone]:
        query = db.query(Zone).filter(Zone.camera_id == camera_id)
        if not include_unconfirmed:
            query = query.filter(Zone.status == "CONFIRMED")
        return query.all()

    @staticmethod
    def get_active_by_camera(db: Session, camera_id: str) -> List[Zone]:
        """Returns ONLY active confirmed zones for AI rule evaluation."""
        return db.query(Zone).filter(
            Zone.camera_id == camera_id,
            Zone.status == "CONFIRMED"
        ).all()

    @staticmethod
    def get_all(db: Session, include_unconfirmed: bool = True) -> List[Zone]:
        query = db.query(Zone)
        if not include_unconfirmed:
            query = query.filter(Zone.status == "CONFIRMED")
        return query.all()

    @staticmethod
    def get_by_id(db: Session, zone_id: str) -> Optional[Zone]:
        return db.query(Zone).filter(Zone.id == zone_id).first()

    @staticmethod
    def create(db: Session, zone_in: ZoneCreate) -> Zone:
        zone = Zone(
            camera_id=zone_in.camera_id,
            name=zone_in.name,
            polygon=zone_in.polygon,
            zone_type=zone_in.zone_type or "restricted",
            status=zone_in.status or "CONFIRMED",
            zone_kind=zone_in.zone_kind or "POLYGON",
            crossing_direction=zone_in.crossing_direction or "both",
            monitored_objects=zone_in.monitored_objects or ["person", "car", "truck", "motorcycle"],
            rules_config=zone_in.rules_config or {}
        )
        if zone.status == "CONFIRMED":
            zone.confirmed_by = "Authorized Operator"
            zone.confirmed_at = datetime.utcnow()

        db.add(zone)
        db.commit()
        db.refresh(zone)
        return zone

    @staticmethod
    def confirm_zone(db: Session, zone_id: str, confirm_in: ZoneConfirmRequest) -> Optional[Zone]:
        """HITL Endpoint: Confirms and Activates a suggested/draft zone."""
        zone = db.query(Zone).filter(Zone.id == zone_id).first()
        if not zone:
            return None

        if confirm_in.name:
            zone.name = confirm_in.name
        if confirm_in.zone_type:
            zone.zone_type = confirm_in.zone_type
        if confirm_in.zone_kind:
            zone.zone_kind = confirm_in.zone_kind
        if confirm_in.crossing_direction:
            zone.crossing_direction = confirm_in.crossing_direction
        if confirm_in.monitored_objects is not None:
            zone.monitored_objects = confirm_in.monitored_objects
        if confirm_in.rules_config is not None:
            zone.rules_config = confirm_in.rules_config

        zone.status = "CONFIRMED"
        zone.confirmed_by = confirm_in.confirmed_by or "Authorized Operator"
        zone.confirmed_at = datetime.utcnow()
        zone.rejection_reason = None
        zone.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(zone)
        return zone

    @staticmethod
    def reject_zone(db: Session, zone_id: str, reason: Optional[str] = None) -> Optional[Zone]:
        """Rejects a suggested draft boundary."""
        zone = db.query(Zone).filter(Zone.id == zone_id).first()
        if not zone:
            return None

        zone.status = "REJECTED"
        zone.rejection_reason = reason or "Rejected by user review"
        zone.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(zone)
        return zone

    @staticmethod
    def update_zone(db: Session, zone_id: str, update_in: ZoneUpdate) -> Optional[Zone]:
        """
        Updates zone attributes.
        IMPORTANT: If polygon geometry changes on a CONFIRMED zone,
        reverts status to PENDING_CONFIRMATION to require re-confirmation!
        """
        zone = db.query(Zone).filter(Zone.id == zone_id).first()
        if not zone:
            return None

        geometry_changed = False
        if update_in.polygon is not None and update_in.polygon != zone.polygon:
            zone.polygon = update_in.polygon
            geometry_changed = True

        if update_in.name is not None:
            zone.name = update_in.name
        if update_in.zone_type is not None:
            zone.zone_type = update_in.zone_type
        if update_in.zone_kind is not None:
            zone.zone_kind = update_in.zone_kind
        if update_in.crossing_direction is not None:
            zone.crossing_direction = update_in.crossing_direction
        if update_in.monitored_objects is not None:
            zone.monitored_objects = update_in.monitored_objects
        if update_in.rules_config is not None:
            zone.rules_config = update_in.rules_config
        if update_in.status is not None:
            zone.status = update_in.status

        # Mandatory HITL Re-confirmation Rule:
        if geometry_changed and zone.status == "CONFIRMED" and (update_in.status is None):
            zone.status = "PENDING_CONFIRMATION"

        zone.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(zone)
        return zone

    @staticmethod
    def delete(db: Session, zone_id: str) -> bool:
        zone = db.query(Zone).filter(Zone.id == zone_id).first()
        if zone:
            db.delete(zone)
            db.commit()
            return True
        return False
