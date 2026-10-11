import json
import os
from typing import Dict, Any, Optional
from app.core.config import settings
from app.core.logging import logger

DEFAULT_RULE_SETTINGS = {
    "loitering_dwell_seconds": 60.0,
    "repeated_entry_window_seconds": 120.0,
    "repeated_entry_threshold": 3,
    "unusual_speed_px_per_sec": 180.0,
    "stationary_abandoned_seconds": 45.0,
    "cooldown_seconds": 5.0,
    "enabled_rules": {
        "RESTRICTED_ENTRY": True,
        "LINE_CROSSING": True,
        "LOITERING": True,
        "REPEATED_ENTRY": True,
        "UNUSUAL_MOVEMENT": True,
        "ABANDONED_OBJECT": True,
        "ANPR": False,           # ANPR disabled by default per requirements
        "ANPR_DETECTED": False,  # Vehicle passing on highway must NOT generate ANPR event
        "WATCHLIST_MATCH": True,
        "NIGHT_MOVEMENT": True,
    }
}

class RuleService:
    _instance: Optional['RuleService'] = None
    _config: Dict[str, Any] = {}

    def __init__(self):
        self._config_file = os.path.join(settings.resolved_storage_dir, "rule_settings.json")
        self._load()

    @classmethod
    def get_instance(cls) -> 'RuleService':
        if cls._instance is None:
            cls._instance = RuleService()
        return cls._instance

    def _load(self):
        self._config = dict(DEFAULT_RULE_SETTINGS)
        self._config["enabled_rules"] = dict(DEFAULT_RULE_SETTINGS["enabled_rules"])
        if os.path.exists(self._config_file):
            try:
                with open(self._config_file, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                    if isinstance(saved, dict):
                        for k, v in saved.items():
                            if k == "enabled_rules" and isinstance(v, dict):
                                self._config["enabled_rules"].update(v)
                            else:
                                self._config[k] = v
            except Exception as e:
                logger.warning(f"Failed to read rule settings from {self._config_file}: {e}")

    def _save(self):
        try:
            os.makedirs(os.path.dirname(self._config_file), exist_ok=True)
            with open(self._config_file, "w", encoding="utf-8") as f:
                json.dump(self._config, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to write rule settings to {self._config_file}: {e}")

    def get_settings(self) -> Dict[str, Any]:
        return self._config

    def update_settings(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        for k, v in payload.items():
            if k == "enabled_rules" and isinstance(v, dict):
                self._config["enabled_rules"].update(v)
            else:
                self._config[k] = v
        self._save()
        return self._config

    def is_rule_enabled(self, rule_name: str) -> bool:
        """
        Checks whether a specific event rule is enabled.
        Normalizes rule names (e.g. INTRUSION maps to RESTRICTED_ENTRY).
        """
        norm_name = rule_name.upper().strip()
        alias_map = {
            "INTRUSION": "RESTRICTED_ENTRY",
            "ANPR": "ANPR_DETECTED",
        }
        effective_key = alias_map.get(norm_name, norm_name)
        return bool(self._config.get("enabled_rules", {}).get(effective_key, False))

rule_service = RuleService.get_instance()
