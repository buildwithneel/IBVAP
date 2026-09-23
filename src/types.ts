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
  forceUnit: string;
  deploymentStation: string;
  clearanceLevel: string;
  activeSessionIp: string;
  loginTime: string;
  lastAuditDate: string;
  contactExtension: string;
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
}
