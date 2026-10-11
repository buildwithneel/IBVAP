from datetime import datetime
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict

# --- Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[str] = None
    role: Optional[str] = None

class LoginRequest(BaseModel):
    badgeOrEmail: str
    password: str
    role: Optional[str] = None

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    badge_number: Optional[str] = None
    unit: Optional[str] = None
    role: Optional[str] = "operator"

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    badge_number: Optional[str] = None
    role: str
    name: str
    unit: Optional[str] = None
    created_at: datetime

# --- Bounding Box & Polygon Schemas ---
class BoundingBoxSchema(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

class ObjectDetectionSchema(BaseModel):
    class_name: str
    confidence: float
    bbox: BoundingBoxSchema
    object_id: Optional[int] = None
    plate_number: Optional[str] = None

# --- Camera Schemas ---
class CameraCreate(BaseModel):
    name: str
    stream_url: str
    source_type: str = "rtsp"  # file, webcam, rtsp, onvif
    ip_address: Optional[str] = None
    port: Optional[int] = 554
    username: Optional[str] = None
    password: Optional[str] = None
    substream_url: Optional[str] = None
    enabled: Optional[bool] = True
    sector: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    fps: Optional[int] = 30

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    stream_url: Optional[str] = None
    source_type: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    substream_url: Optional[str] = None
    enabled: Optional[bool] = None
    status: Optional[str] = None
    sector: Optional[str] = None
    location: Optional[str] = None

class CameraResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    camera_id: Optional[str] = None
    code: Optional[str] = None
    name: str
    stream_url: str
    source_type: str
    status: str
    ip_address: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    substream_url: Optional[str] = None
    enabled: Optional[bool] = True
    sector: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    fps: Optional[int] = 30
    created_at: datetime
    updated_at: datetime
    last_seen_at: Optional[datetime] = None

class CameraTestConnectionRequest(BaseModel):
    source_type: str = "rtsp"  # rtsp, onvif, webcam, file
    stream_url: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None

class CameraTestConnectionResponse(BaseModel):
    success: bool
    reachable: bool
    message: str
    resolution: Optional[str] = None
    fps: Optional[float] = None
    latency_ms: Optional[float] = None
    protocol: Optional[str] = None

class DiscoveredCamera(BaseModel):
    ip: str
    port: int
    xaddrs: str
    types: str
    manufacturer: Optional[str] = "Generic ONVIF / IP Device"
    model: Optional[str] = "Network Video Transmitter"
    suggested_stream_url: str

class CameraDiscoveryResponse(BaseModel):
    discovered: List[DiscoveredCamera]
    total: int
    message: str
    scanned_at: str

class CameraListResponse(BaseModel):
    cameras: List[CameraResponse]

class CameraHealthItem(BaseModel):
    camera_id: str
    state: str
    fps: float
    last_frame_time: str
    active_tracks: int = 0
    latency_ms: Optional[float] = None
    packet_loss: Optional[float] = None
    temperature_c: Optional[float] = None
    resolution: Optional[str] = None

class CameraHealthListResponse(BaseModel):
    cameras: Dict[str, CameraHealthItem]
    total: int

class CameraStartRequest(BaseModel):
    camera_id: Optional[str] = None
    name: Optional[str] = None
    source_type: Optional[str] = "rtsp"  # file, webcam, rtsp
    stream_url: Optional[str] = None
    sector: Optional[str] = None
    location: Optional[str] = None

class CameraStopRequest(BaseModel):
    camera_id: str

class ActiveCameraSession(BaseModel):
    id: str
    camera_id: str
    name: str
    source_type: str
    status: str
    sector: Optional[str] = None
    location: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    fps: Optional[float] = None
    latency_ms: Optional[float] = None
    resolution: Optional[str] = None
    width: int = 0
    height: int = 0
    active_tracks: int = 0
    frames_processed: int = 0
    uptime_seconds: float = 0.0
    stream_url: Optional[str] = None

class ActiveCameraListResponse(BaseModel):
    cameras: List[ActiveCameraSession]
    total: int

# --- Zone & Virtual Fence Schemas ---
class ZoneCreate(BaseModel):
    camera_id: str
    name: str
    polygon: List[List[float]]  # Normalized coordinates [[x1, y1], [x2, y2], ...]
    zone_type: Optional[str] = "restricted"  # restricted, warning, monitoring
    status: Optional[str] = "CONFIRMED"  # DRAFT, PENDING_CONFIRMATION, CONFIRMED, REJECTED, DISABLED
    zone_kind: Optional[str] = "POLYGON"  # POLYGON, LINE
    crossing_direction: Optional[str] = "both"  # both, inbound, outbound
    monitored_objects: Optional[List[str]] = Field(default_factory=lambda: ["person", "car", "truck", "motorcycle"])
    rules_config: Optional[Dict[str, Any]] = None

class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    polygon: Optional[List[List[float]]] = None
    zone_type: Optional[str] = None
    zone_kind: Optional[str] = None
    crossing_direction: Optional[str] = None
    monitored_objects: Optional[List[str]] = None
    rules_config: Optional[Dict[str, Any]] = None
    status: Optional[str] = None

class ZoneConfirmRequest(BaseModel):
    zone_id: str
    name: Optional[str] = None
    zone_type: Optional[str] = "restricted"
    zone_kind: Optional[str] = "POLYGON"
    crossing_direction: Optional[str] = "both"
    monitored_objects: Optional[List[str]] = None
    rules_config: Optional[Dict[str, Any]] = None
    confirmed_by: Optional[str] = "Operator"

class BoundarySuggestionItem(BaseModel):
    id: str
    label: str
    boundary_type: str  # wall, perimeter_fence, gate, door, line_barrier
    confidence: float
    zone_kind: str  # POLYGON, LINE
    polygon: List[List[float]]
    suggested_zone_type: str = "restricted"
    description: str

class BoundarySuggestionResponse(BaseModel):
    camera_id: str
    suggestions: List[BoundarySuggestionItem]
    method_used: str  # opencv_contour_segmentation, yolo_segmentation, manual_fallback
    total: int
    timestamp: str

class RuleSettingsSchema(BaseModel):
    loitering_dwell_seconds: float = 60.0
    repeated_entry_window_seconds: float = 120.0
    repeated_entry_threshold: int = 3
    unusual_speed_px_per_sec: float = 180.0
    stationary_abandoned_seconds: float = 45.0
    cooldown_seconds: float = 5.0
    enabled_rules: Dict[str, bool] = Field(
        default_factory=lambda: {
            "RESTRICTED_ENTRY": True,
            "LINE_CROSSING": True,
            "LOITERING": True,
            "REPEATED_ENTRY": True,
            "UNUSUAL_MOVEMENT": True,
            "ABANDONED_OBJECT": True,
        }
    )

class ZoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    camera_id: str
    name: str
    polygon: List[List[float]]
    zone_type: str
    status: str = "CONFIRMED"
    zone_kind: str = "POLYGON"
    crossing_direction: str = "both"
    monitored_objects: Optional[List[str]] = None
    rules_config: Optional[Dict[str, Any]] = None
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

# --- Detection Schemas ---
class DetectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    camera_id: str
    track_id: Optional[int] = None
    object_type: str
    confidence: float
    bounding_box: List[float]
    timestamp: datetime
    frame_number: int

# --- Evidence Schemas ---
class EvidenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: Optional[str] = None
    image_path: Optional[str] = None
    plate_image_path: Optional[str] = None
    plate_image_url: Optional[str] = None
    video_path: Optional[str] = None
    snapshot_url: Optional[str] = None
    sha256: str
    plate_sha256: Optional[str] = None
    plate_number: Optional[str] = None
    capture_status: Optional[str] = "SUCCESS"
    file_size_bytes: int
    created_at: datetime

# --- Event Schemas ---
class EventObjectMeta(BaseModel):
    class_name: Optional[str] = None
    object_id: Optional[int] = None
    confidence: Optional[float] = None
    bounding_box: Optional[List[float]] = None
    plate_number: Optional[str] = None
    plate_bbox: Optional[List[int]] = None

class EventContextMeta(BaseModel):
    luminance: Optional[float] = None
    low_light: Optional[bool] = None
    time_of_day: Optional[str] = None

class EventZoneMeta(BaseModel):
    zone_id: Optional[str] = None
    name: Optional[str] = None

class EventRuleMeta(BaseModel):
    rule_id: Optional[str] = None
    name: Optional[str] = None

class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: Optional[str] = None
    camera_id: str
    camera_name: Optional[str] = None
    sector: Optional[str] = None
    event_type: str
    severity: str
    risk_score: int
    timestamp: datetime
    track_id: Optional[int] = None
    confidence: float
    plate_number: Optional[str] = None
    plate_image_url: Optional[str] = None
    snapshot_url: Optional[str] = None
    evidence_status: Optional[str] = None
    object: Optional[EventObjectMeta] = None
    zone: Optional[EventZoneMeta] = None
    rule: Optional[EventRuleMeta] = None
    context: Optional[EventContextMeta] = None
    evidence: Optional[EvidenceResponse] = None
    previous_hash: Optional[str] = None
    event_hash: Optional[str] = None
    status: str = "active"
    created_at: datetime

class EventListResponse(BaseModel):
    events: List[EventResponse]
    total: int
    limit: int = 50
    offset: int = 0

class AlertListResponse(BaseModel):
    alerts: List[EventResponse]
    total: int
    limit: int = 50
    offset: int = 0

# --- Watchlist Schemas ---
class WatchlistCreate(BaseModel):
    type: str  # plate, person
    value: str
    description: Optional[str] = None

class WatchlistResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    value: str
    description: Optional[str] = None
    created_at: datetime

# --- Audit Trail Schemas ---
class AuditRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sequence_number: int
    timestamp: datetime
    event_id: str
    event_type: str
    previous_hash: str
    payload_hash: str
    record_hash: str
    operator_id: Optional[str] = None
    operator_name: Optional[str] = None
    operator_role: Optional[str] = None
    action: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[str] = None
    status: Optional[str] = "SUCCESS"

class AuditListResponse(BaseModel):
    records: List[AuditRecordResponse]
    total: int
    limit: int = 50
    offset: int = 0

class AuditVerificationResponse(BaseModel):
    valid: bool
    is_valid: bool
    records_checked: int
    total_records: int
    first_invalid_sequence: Optional[int] = None
    errors: List[str] = []
    genesis_hash: Optional[str] = None
    latest_hash: Optional[str] = None

# --- Statistics & Health Schemas ---
class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "IBVAP Backend Engine"

class SystemStatisticsResponse(BaseModel):
    total_events: int = 0
    intrusions: int = 0
    prolonged_presence: int = 0
    risk_assessments: int = 0
    high_severity: int = 0
    critical_severity: int = 0
    evidence_events: int = 0
    total_cameras: int = 0
    active_cameras: int = 0
    offline_cameras: int = 0
    degraded_cameras: int = 0
    total_persons: int = 0
    total_vehicles: int = 0
    critical_alerts: int = 0
    high_alerts: int = 0
    stream_latency_ms: float = 0.0
    network_mbps: float = 0.0
    camera_health: Dict[str, int] = Field(
        default_factory=lambda: {
            "total": 0,
            "healthy": 0,
            "degraded": 0,
            "offline": 0,
            "recovering": 0,
        }
    )

class SystemHealthResponse(BaseModel):
    videoIngestion: str = "healthy"  # healthy, degraded, down
    aiPipeline: str = "healthy"
    cameraNetworkPercent: float = 100.0
    database: str = "healthy"
    evidenceStorage: str = "healthy"
    averageLatencyMs: float = 0.0
    ingestionLatencyMs: Optional[float] = None
    activeModel: str = "Ultralytics YOLOv8n"
    eventsPerSecond: float = 0.0
    activeStreamCount: int = 0
    storageUsedGb: float = 0.0
    storageTotalGb: float = 100.0
    lastSyncTimestamp: str

# --- Incident Schemas ---
class IncidentNoteCreate(BaseModel):
    author: str
    role: str = "OPERATOR"
    text: str

class IncidentNoteResponse(BaseModel):
    id: str
    author: str
    role: str
    timestamp: str
    text: str

class IncidentTimelineEventSchema(BaseModel):
    id: str
    timestamp: str
    title: str
    description: str
    actor: str
    type: str  # detection, ai_trigger, operator_action, system, escalation

class IncidentExplanationStepSchema(BaseModel):
    stepNumber: int
    title: str
    description: str
    timestamp: str
    confidence: Optional[float] = None
    status: str  # normal, flagged, trigger

class IncidentResponse(BaseModel):
    id: str
    title: str
    alertId: str
    type: str
    severity: str
    cameraId: str
    cameraName: str
    location: str
    sector: str
    detectedAt: str
    status: str
    objectClass: str
    confidence: float
    assignedTo: Optional[str] = None
    priority: int = 1
    explanationSteps: List[IncidentExplanationStepSchema] = []
    timeline: List[IncidentTimelineEventSchema] = []
    notes: List[IncidentNoteResponse] = []
    evidenceId: Optional[str] = None

class IncidentListResponse(BaseModel):
    incidents: List[IncidentResponse]
    total: int

class AuditActionLogCreate(BaseModel):
    id: Optional[str] = None
    timestamp: Optional[str] = None
    operatorId: Optional[str] = "SYSTEM"
    operatorName: Optional[str] = "Surveillance Operator"
    operatorRole: Optional[str] = "OPERATOR"
    action: Optional[str] = "OPERATOR_ACTION"
    targetType: Optional[str] = "system"
    targetId: Optional[str] = None
    details: Optional[str] = ""
    ipAddress: Optional[str] = "127.0.0.1"
    status: Optional[str] = "SUCCESS"

# --- PTZ Control Schemas ---
class PTZMoveRequest(BaseModel):
    command: str = "relative"  # left, right, up, down, zoom_in, zoom_out, relative, continuous
    pan: float = 0.0           # -1.0 to 1.0
    tilt: float = 0.0          # -1.0 to 1.0
    zoom: float = 0.0          # -1.0 to 1.0
    speed: float = 1.0         # 0.1 to 1.0

class PTZStopRequest(BaseModel):
    pan_tilt: bool = True
    zoom: bool = True

class PTZPresetCreateRequest(BaseModel):
    name: str

class PTZPresetItem(BaseModel):
    token: str
    name: str

class PTZPresetListResponse(BaseModel):
    camera_id: str
    presets: List[PTZPresetItem]
    total: int

class PTZCapabilitiesResponse(BaseModel):
    camera_id: str
    is_ptz_supported: bool
    is_simulated: bool
    ptz_type: str  # onvif_profile_s, simulated_viewport, fixed_unsupported
    supports_continuous_move: bool
    supports_relative_move: bool
    supports_zoom: bool
    supports_presets: bool
    presets: List[PTZPresetItem] = []
    message: str

# --- Thermal Imaging Schemas ---
class ThermalSettingsRequest(BaseModel):
    enabled: bool
    palette: Optional[str] = "ironbow"  # ironbow, white_hot, black_hot, rainbow
    simulate_on_rgb: Optional[bool] = False

class ThermalStatusResponse(BaseModel):
    camera_id: str
    has_thermal_sensor: bool
    is_simulated: bool
    is_active: bool
    stream_mode: str  # optical_rgb, thermal_radiometric, simulated_thermal
    palette: str
    available_palettes: List[str]
    calibrated_temperatures_available: bool
    min_temp_c: Optional[float] = None
    max_temp_c: Optional[float] = None
    spot_temp_c: Optional[float] = None
    hardware_notice: str

# --- Night Vision Schemas ---
class NightVisionRequest(BaseModel):
    mode: str  # auto, day, night, low_light_enhancement

class NightVisionStatusResponse(BaseModel):
    camera_id: str
    supported: bool
    mode: str  # auto, day, night, low_light_enhancement, unsupported
    ir_cut_filter: Optional[str] = None
    current_luminance: float = 0.0
    is_low_light: bool = False
    control_type: str  # hardware_onvif, camera_automatic, digital_enhancement, unsupported
    message: str

