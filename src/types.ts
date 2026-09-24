export type CameraStatus = "ACTIVE" | "OFFLINE" | "MAINTENANCE" | "ALERT";

export interface Camera {
  id: string;
  code: string;
  name: string;
  sector: string;
  postNumber: string;
  status: CameraStatus;
  streamUrl?: string;
  resolution: string;
  fps: number;
  ipAddress: string;
  lastHeartbeat: string;
  personsActive: number;
  vehiclesActive: number;
}

export type DetectionType = "person" | "vehicle" | "object" | "breach";

export interface BoundingBox {
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  width: number;
  height: number;
  label: string;
  confidence: number;
  type: DetectionType;
}

export interface DetectionItem {
  id: string;
  cameraId: string;
  cameraCode: string;
  sector: string;
  type: DetectionType;
  label: string;
  confidence: number;
  timestamp: string;
  severity: "normal" | "warn" | "critical";
  details?: string;
}

export type AlertSeverity = "critical" | "warning" | "advisory";

export interface SecurityAlert {
  id: string;
  code: string;
  title: string;
  description: string;
  cameraId: string;
  cameraCode: string;
  sector: string;
  severity: AlertSeverity;
  timestamp: string;
  status: "unresolved" | "investigating" | "resolved";
  assignedUnit?: string;
}

export interface IncidentReport {
  id: string;
  reportNumber: string;
  title: string;
  sector: string;
  incidentDate: string;
  generatedAt: string;
  reportingOfficer: string;
  classification: "Restricted" | "Confidential" | "Secret";
  status: "Filed" | "Under Review" | "Closed";
  summary: string;
  detectionsCount: number;
}

export interface IntelligenceItem {
  id: string;
  referenceCode: string;
  title: string;
  sector: string;
  observedPattern: string;
  priority: "HIGH" | "MEDIUM" | "ROUTINE";
  dateReported: string;
  status: "Active Monitoring" | "Verified" | "Archived";
  threatLevel: string;
  notes: string;
}

export interface OperatorProfile {
  name: string;
  officerId: string;
  designation: string;
  role?: string;
  organization?: string;
  forceUnit: string;
  deploymentStation: string;
  clearanceLevel: string;
  status?: string;
  assignment?: string;
  sessionStatus?: string;
  lastActivity?: string;
  activeSessionIp: string;
  loginTime: string;
  lastAuditDate: string;
  contactExtension: string;
  permissions?: { label: string; status: "Granted" | "Requires Supervisor" | "Restricted" }[];
  sessionLog?: { time: string; action: string; status: "OK" | "ACK" | "WARN" }[];
}

export interface SystemMetrics {
  totalCameras: number;
  activeCameras: number;
  offlineCameras: number;
  maintenanceCameras: number;
  personsDetected: number;
  vehiclesDetected: number;
  criticalAlerts: number;
  warningsToday: number;
  streamLatencyMs: number;
  networkThroughputMbps: number;
  operationalStatus: string;
  defconLevel: string;
  storageUsedGb?: number;
  storageTotalGb?: number;
  databaseStatus?: string;
  eventsPerSecond?: number;
}

// ==========================================
// BACKEND SERVICE SCHEMAS & RESPONSES
// ==========================================

export interface BackendUser {
  id: string;
  email: string;
  badgeNumber: string;
  role: string;
  name: string;
  unit: string;
  permissions: string[];
}

export interface BackendLoginRequest {
  badgeOrEmail: string;
  password: string;
  role?: string;
}

export interface BackendLoginResponse {
  access_token: string;
  token_type: string;
  user: BackendUser;
}

export interface BackendCameraResponse {
  id: string;
  name: string;
  stream_url: string;
  source_type: string;
  status: string;
  sector: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  fps?: number;
  created_at?: string;
  updated_at?: string;
  last_seen_at?: string;
}

export interface BackendCameraCreatePayload {
  name: string;
  stream_url: string;
  source_type?: string;
  sector: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  fps?: number;
}

export interface BackendCameraUpdatePayload {
  name?: string;
  stream_url?: string;
  source_type?: string;
  sector?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  fps?: number;
}

export interface BackendCameraListResponse {
  cameras: BackendCameraResponse[];
  total: number;
}

export interface BackendCameraHealthItem {
  status: string;
  is_active?: boolean;
  active_tracks?: number;
  fps?: number;
  last_frame_time?: string;
}

export type BackendCameraHealthMap = Record<string, BackendCameraHealthItem>;

export interface BackendStatisticsResponse {
  total_cameras?: number;
  active_cameras?: number;
  offline_cameras?: number;
  degraded_cameras?: number;
  total_persons?: number;
  total_vehicles?: number;
  critical_alerts?: number;
  high_alerts?: number;
  total_events?: number;
  total_intrusions?: number;
  total_loitering?: number;
  total_evidence?: number;
  [key: string]: any;
}

export interface BackendSystemHealthResponse {
  videoIngestion?: string;
  aiPipeline?: string;
  database?: string;
  evidenceStorage?: string;
  averageLatencyMs?: number;
  eventsPerSecond?: number;
  storageUsedGb?: number;
  storageTotalGb?: number;
  [key: string]: any;
}

export interface BackendEventResponse {
  id: string;
  camera_id: string;
  event_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  status: "active" | "acknowledged" | "resolved" | string;
  risk_score?: number;
  title?: string;
  description?: string;
  timestamp: string;
  extra_data?: any;
  camera_name?: string;
  sector?: string;
}

export interface BackendDetectionRecord {
  id: string;
  camera_id: string;
  class_name: string;
  confidence: number;
  bbox: number[]; // [x1, y1, x2, y2]
  track_id?: number;
  timestamp: string;
  sector?: string;
  camera_code?: string;
}

export interface BackendDetectionListResponse {
  detections: BackendDetectionRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface ExplanationStep {
  step: number;
  title: string;
  stage: string;
  status: "completed" | "flagged" | "triggered" | "normal" | string;
  details: string;
  confidence?: number;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface IncidentTimelineItem {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details?: string;
  status?: string;
}

export interface IncidentNote {
  id: string;
  author: string;
  role?: string;
  text: string;
  timestamp: string;
}

export interface BackendIncidentDetail {
  id: string;
  reportNumber?: string;
  title: string;
  sector: string;
  status: "ACTIVE" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED" | "CLOSED" | "Filed" | "Under Review" | string;
  classification?: string;
  incidentDate?: string;
  generatedAt?: string;
  reportingOfficer?: string;
  summary?: string;
  explanationSteps?: ExplanationStep[];
  timeline?: IncidentTimelineItem[];
  notes?: IncidentNote[];
  evidenceIds?: string[];
  evidence?: BackendEvidenceItem[];
}

export interface BackendEvidenceItem {
  id: string;
  incident_id: string;
  evidence_type: "snapshot" | "video_clip" | string;
  file_path: string;
  sha256_hash: string;
  timestamp: string;
  url?: string;
}

export interface EvidenceVerificationResult {
  valid: boolean;
  sha256: string;
  stored_hash: string;
  calculated_hash: string;
  verification_result: string;
  timestamp: string;
}

export interface AuditRecord {
  id: string;
  sequence: number;
  timestamp: string;
  action: string;
  operator: string;
  operatorId?: string;
  status: "OK" | "ACK" | "WARN" | "CRITICAL" | "SUCCESS" | string;
  record_hash: string;
  previous_hash?: string;
  details?: string;
}

export interface AuditVerificationResponse {
  valid: boolean;
  records_checked: number;
  latest_hash: string;
  errors: string[];
  timestamp?: string;
}

export interface CameraDiagnostics {
  camera_id: string;
  camera_name?: string;
  measured_fps: number;
  configured_fps: number;
  latency_ms: number;
  packet_loss_pct: number;
  sensor_status: "HEALTHY" | "DEGRADED" | "OFFLINE" | "PASS" | string;
  frames_processed: number;
  resolution: string;
  codec?: string;
  last_ping: string;
}

