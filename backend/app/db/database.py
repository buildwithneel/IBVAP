from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

connect_args = {}
db_url = settings.resolved_database_url
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def init_db_schema():
    Base.metadata.create_all(bind=engine)
    if db_url.startswith("sqlite"):
        try:
            with engine.connect() as conn:
                from sqlalchemy import text
                res = conn.execute(text("PRAGMA table_info(audit_records)")).fetchall()
                existing_cols = [row[1] for row in res]
                new_cols = {
                    "operator_id": "VARCHAR",
                    "operator_name": "VARCHAR",
                    "operator_role": "VARCHAR",
                    "action": "VARCHAR",
                    "target_type": "VARCHAR",
                    "target_id": "VARCHAR",
                    "details": "TEXT",
                    "status": "VARCHAR DEFAULT 'SUCCESS'"
                }
                for col_name, col_type in new_cols.items():
                    if existing_cols and col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE audit_records ADD COLUMN {col_name} {col_type}"))

                # Check cameras table for updated fields
                res_cam = conn.execute(text("PRAGMA table_info(cameras)")).fetchall()
                cam_cols = [row[1] for row in res_cam]
                new_cam_cols = {
                    "ip_address": "VARCHAR",
                    "port": "INTEGER DEFAULT 554",
                    "username": "VARCHAR",
                    "substream_url": "VARCHAR",
                    "enabled": "BOOLEAN DEFAULT 1",
                    "ptz_supported": "BOOLEAN DEFAULT 0",
                    "ptz_service_url": "VARCHAR",
                    "thermal_capable": "BOOLEAN DEFAULT 0",
                    "night_vision_mode": "VARCHAR DEFAULT 'auto'"
                }
                for col_name, col_type in new_cam_cols.items():
                    if cam_cols and col_name not in cam_cols:
                        conn.execute(text(f"ALTER TABLE cameras ADD COLUMN {col_name} {col_type}"))

                # Check evidence table for plate columns
                res_evd = conn.execute(text("PRAGMA table_info(evidence)")).fetchall()
                evd_cols = [row[1] for row in res_evd]
                new_evd_cols = {
                    "plate_image_path": "VARCHAR",
                    "plate_sha256": "VARCHAR"
                }
                for col_name, col_type in new_evd_cols.items():
                    if evd_cols and col_name not in evd_cols:
                        conn.execute(text(f"ALTER TABLE evidence ADD COLUMN {col_name} {col_type}"))

                # Check zones table for HITL & virtual fence fields
                res_zone = conn.execute(text("PRAGMA table_info(zones)")).fetchall()
                zone_cols = [row[1] for row in res_zone]
                new_zone_cols = {
                    "status": "VARCHAR DEFAULT 'CONFIRMED'",
                    "zone_kind": "VARCHAR DEFAULT 'POLYGON'",
                    "crossing_direction": "VARCHAR DEFAULT 'both'",
                    "monitored_objects": "JSON",
                    "rules_config": "JSON",
                    "confirmed_by": "VARCHAR",
                    "confirmed_at": "DATETIME",
                    "rejection_reason": "VARCHAR"
                }
                for col_name, col_type in new_zone_cols.items():
                    if zone_cols and col_name not in zone_cols:
                        conn.execute(text(f"ALTER TABLE zones ADD COLUMN {col_name} {col_type}"))

                conn.commit()
        except Exception as e:
            from app.core.logging import logger
            logger.warning(f"DB schema migration notice: {e}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
