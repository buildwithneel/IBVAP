import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, DateTime, Text, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.db.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    badge_number = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="operator")  # operator, supervisor, admin
    name = Column(String, nullable=False)
    unit = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    stream_url = Column(String, nullable=False)
    source_type = Column(String, default="rtsp")  # file, webcam, rtsp, onvif
    status = Column(String, default="CREATED")   # CREATED, STARTING, ONLINE, RECONNECTING, OFFLINE, STOPPING, STOPPED
    ip_address = Column(String, nullable=True)
    port = Column(Integer, nullable=True, default=554)
    username = Column(String, nullable=True)
    substream_url = Column(String, nullable=True)
    enabled = Column(Boolean, default=True)
    sector = Column(String, nullable=True)
    location = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    fps = Column(Integer, default=30)
    ptz_supported = Column(Boolean, default=False)
    ptz_service_url = Column(String, nullable=True)
    thermal_capable = Column(Boolean, default=False)
    night_vision_mode = Column(String, default="auto")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=True)

    zones = relationship("Zone", back_populates="camera", cascade="all, delete-orphan")
    detections = relationship("Detection", back_populates="camera", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="camera", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="camera", cascade="all, delete-orphan")

class Zone(Base):
    __tablename__ = "zones"

    id = Column(String, primary_key=True, default=generate_uuid)
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    name = Column(String, nullable=False)
    polygon = Column(JSON, nullable=False)  # List of [x, y] coordinates normalized (0-1)
    zone_type = Column(String, default="restricted")  # restricted, warning, monitoring
    status = Column(String, default="CONFIRMED")  # DRAFT, PENDING_CONFIRMATION, CONFIRMED, REJECTED, DISABLED
    zone_kind = Column(String, default="POLYGON")  # POLYGON, LINE
    crossing_direction = Column(String, default="both")  # both, inbound, outbound
    monitored_objects = Column(JSON, nullable=True)  # ["person", "car", "truck", "motorcycle"]
    rules_config = Column(JSON, nullable=True)  # dwell_time_seconds, repeated_entry_threshold, etc.
    confirmed_by = Column(String, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    camera = relationship("Camera", back_populates="zones")

class Detection(Base):
    __tablename__ = "detections"

    id = Column(String, primary_key=True, default=generate_uuid)
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    track_id = Column(Integer, nullable=True)
    object_type = Column(String, nullable=False)  # person, car, motorcycle, bus, truck, face
    confidence = Column(Float, nullable=False)
    bounding_box = Column(JSON, nullable=False)  # [x1, y1, x2, y2]
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    frame_number = Column(Integer, default=0)

    camera = relationship("Camera", back_populates="detections")

class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=generate_uuid)
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    event_type = Column(String, nullable=False)  # INTRUSION, LOITERING, NIGHT_MOVEMENT, VEHICLE_DETECTED, ANPR_DETECTED, WATCHLIST_MATCH, CAMERA_OFFLINE
    severity = Column(String, default="HIGH")   # LOW, MEDIUM, HIGH, CRITICAL
    risk_score = Column(Integer, default=0)    # 0 - 100
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    track_id = Column(Integer, nullable=True)
    confidence = Column(Float, default=0.0)
    event_metadata = Column("metadata", JSON, nullable=True)  # Factors, bounding box, zone name, etc.
    evidence_id = Column(String, ForeignKey("evidence.id"), nullable=True)
    previous_hash = Column(String, nullable=True)
    event_hash = Column(String, nullable=True)
    status = Column(String, default="active")   # active, acknowledged, resolved
    created_at = Column(DateTime, default=datetime.utcnow)

    camera = relationship("Camera", back_populates="events")
    evidence = relationship("Evidence", back_populates="event", uselist=False)

class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(String, primary_key=True, default=generate_uuid)
    event_id = Column(String, nullable=True)
    image_path = Column(String, nullable=True)
    plate_image_path = Column(String, nullable=True)
    video_path = Column(String, nullable=True)
    sha256 = Column(String, nullable=False)
    plate_sha256 = Column(String, nullable=True)
    file_size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    event = relationship("Event", back_populates="evidence", uselist=False)

class Watchlist(Base):
    __tablename__ = "watchlist"

    id = Column(String, primary_key=True, default=generate_uuid)
    type = Column(String, nullable=False)  # plate, person
    value = Column(String, nullable=False, index=True)  # License plate number or target value
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditRecord(Base):
    __tablename__ = "audit_records"

    sequence_number = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_id = Column(String, nullable=False)
    event_type = Column(String, nullable=False)
    previous_hash = Column(String, nullable=False)
    payload_hash = Column(String, nullable=False)
    record_hash = Column(String, nullable=False)
    operator_id = Column(String, nullable=True)
    operator_name = Column(String, nullable=True)
    operator_role = Column(String, nullable=True)
    action = Column(String, nullable=True)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    status = Column(String, default="SUCCESS")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, default=generate_uuid)
    event_id = Column(String, ForeignKey("events.id"), nullable=True)
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    title = Column(String, nullable=False)
    type = Column(String, nullable=False)
    severity = Column(String, default="high")  # critical, high, medium, low
    status = Column(String, default="unacknowledged")  # unacknowledged, under_review, escalated, resolved, false_positive
    assigned_to = Column(String, nullable=True)
    priority = Column(Integer, default=1)
    detected_at = Column(DateTime, default=datetime.utcnow)
    evidence_id = Column(String, nullable=True)
    object_class = Column(String, default="Person")
    confidence = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    camera = relationship("Camera", back_populates="incidents")
    event = relationship("Event")
    notes = relationship("IncidentNote", back_populates="incident", cascade="all, delete-orphan")

class IncidentNote(Base):
    __tablename__ = "incident_notes"

    id = Column(String, primary_key=True, default=generate_uuid)
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    author = Column(String, nullable=False)
    role = Column(String, default="OPERATOR")
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    incident = relationship("Incident", back_populates="notes")

