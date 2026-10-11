import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "IBVAP Backend Service"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "ibvap-secret-key-change-in-production-secure-random"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ALGORITHM: str = "HS256"

    # Database
    DATABASE_URL: str = "sqlite:///./ibvap.db"

    # AI Model Settings
    YOLO_MODEL_PATH: str = "models/yolov8n.pt"
    YOLO_CONFIDENCE_THRESHOLD: float = 0.22
    YOLO_TWO_WHEELER_CONFIDENCE_THRESHOLD: float = 0.12
    YOLO_IOU_THRESHOLD: float = 0.45
    YOLO_DEVICE: str = "cpu"
    TRACKER_MAX_COAST_FRAMES: int = 15
    DEBUG_OVERLAY: bool = True

    # Rule Engine Settings
    ZONE_CONFIRMATION_FRAMES: int = 3
    TRACK_STATE_TTL_SECONDS: float = 3.0
    LOITERING_THRESHOLD_SECONDS: float = 10.0
    EVENT_COOLDOWN_SECONDS: float = 8.0
    NIGHT_START_TIME: str = "20:00"
    NIGHT_END_TIME: str = "06:00"
    TIMEZONE: str = "UTC"
    LOW_LIGHT_THRESHOLD: float = 80.0
    LOW_LIGHT_CONFIRMATION_FRAMES: int = 5

    # Vehicle Event Deduplication & Grouping Settings
    VEHICLE_EVENT_GROUPING_WINDOW_SECONDS: float = 12.0
    VEHICLE_EVENT_COOLDOWN_SECONDS: float = 10.0

    # Motion & Unusual Movement False Alert Suppression Settings
    UNUSUAL_MOVEMENT_SPEED_THRESHOLD_PX_SEC: float = 380.0
    UNUSUAL_MOVEMENT_PERSISTENCE_FRAMES: int = 6
    UNUSUAL_MOVEMENT_MIN_CONFIDENCE: float = 0.45
    MOTION_ALERT_MIN_CONFIDENCE: float = 0.40
    MOTION_ALERT_PERSISTENCE_FRAMES: int = 5

    # Storage
    STORAGE_DIR: str = "storage"

    # Temporary Development/Testing Modules
    ENABLE_LOCAL_CAMERA_TESTING: bool = True

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", "../.env"),
        extra="ignore"
    )

    @property
    def resolved_database_url(self) -> str:
        if self.DATABASE_URL == "sqlite:///./ibvap.db":
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            db_file = os.path.join(backend_dir, "ibvap.db").replace("\\", "/")
            return f"sqlite:///{db_file}"
        return self.DATABASE_URL

    @property
    def resolved_storage_dir(self) -> str:
        if self.STORAGE_DIR == "storage":
            backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            return os.path.join(backend_dir, "storage")
        return self.STORAGE_DIR

settings = Settings()

os.makedirs(os.path.join(settings.resolved_storage_dir, "evidence"), exist_ok=True)
os.makedirs(os.path.join(settings.resolved_storage_dir, "uploads"), exist_ok=True)
os.makedirs("models", exist_ok=True)
