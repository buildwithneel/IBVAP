from fastapi import APIRouter
from typing import Dict, Any
from app.services.rule_service import rule_service
from app.schemas.schemas import RuleSettingsSchema

router = APIRouter(prefix="/rules", tags=["Rule Settings & Configuration"])

@router.get("/settings")
def get_rule_settings():
    """
    Returns the current rule engine configuration including enabled rules,
    dwell time thresholds, cooldowns, and ANPR toggle.
    """
    return rule_service.get_settings()

@router.put("/settings")
def update_rule_settings(payload: Dict[str, Any]):
    """
    Updates rule engine parameters and enabled/disabled rules dynamically.
    """
    updated = rule_service.update_settings(payload)
    return {"message": "Rule settings updated successfully", "settings": updated}
