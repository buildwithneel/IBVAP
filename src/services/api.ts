import {
  Camera,
  DetectionItem,
  SecurityAlert,
  SystemMetrics,
  BackendLoginRequest,
  BackendLoginResponse,
  BackendUser,
  BackendCameraResponse,
  BackendCameraCreatePayload,
  BackendCameraUpdatePayload,
  BackendCameraListResponse,
  BackendCameraHealthMap,
  BackendStatisticsResponse,
  BackendSystemHealthResponse,
  BackendEventResponse,
  BackendDetectionListResponse,
  BackendIncidentDetail,
  IncidentNote,
  BackendEvidenceItem,
  EvidenceVerificationResult,
  AuditRecord,
  AuditVerificationResponse,
  CameraDiagnostics,
  CameraTestConnectionRequest,
  CameraTestConnectionResponse,
  CameraDiscoveryResponse,
  TestStreamVideo,
  TestStreamStatus,
  StartTestStreamPayload,
  StopTestStreamPayload,
  PtzCapabilitiesResponse,
  PtzMoveRequest,
  PtzPreset,
  PtzPresetsResponse,
  PtzActionResponse,
  ThermalStatusResponse,
  ThermalConfigRequest,
  NightVisionStatusResponse,
  NightVisionConfigRequest,
} from "../types";

const RAW_API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";
// Clean trailing slashes, /api/v1, or /api so endpoints like /api/v1/... never produce duplicate /api/api/v1
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/api(\/v1)?\/?$/, "").replace(/\/$/, "");

const TOKEN_KEY = "ibvap_jwt_token";
const USER_KEY = "ibvap_user_profile";

export class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getMjpegStreamUrl(cameraId: string): string {
    return `${this.baseUrl}/api/v1/streams/${encodeURIComponent(cameraId)}/mjpeg`;
  }

  public getRawMjpegStreamUrl(cameraId: string): string {
    return `${this.baseUrl}/api/v1/streams/${encodeURIComponent(cameraId)}/raw`;
  }

  public resolveMediaUrl(path?: string | null): string {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
      return path;
    }
    const clean = path.replace(/\\/g, "/");
    return clean.startsWith("/") ? `${this.baseUrl}${clean}` : `${this.baseUrl}/${clean}`;
  }

  // ==========================================
  // TOKEN & LOCAL SESSION MANAGEMENT
  // ==========================================

  public getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  public setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.warn("Unable to save token to localStorage:", e);
    }
  }

  public removeToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.warn("Unable to remove token from localStorage:", e);
    }
  }

  public isTokenValid(token?: string | null): boolean {
    const t = token ?? this.getToken();
    if (!t || typeof t !== "string" || !t.trim()) return false;
    try {
      const parts = t.split(".");
      if (parts.length !== 3) {
        this.removeToken();
        return false;
      }
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      const parsed = JSON.parse(jsonPayload);
      if (parsed.exp && typeof parsed.exp === "number") {
        if (Date.now() >= (parsed.exp - 5) * 1000) {
          console.info("Session token expired, clearing local credentials.");
          this.removeToken();
          return false;
        }
      }
      return true;
    } catch {
      this.removeToken();
      return false;
    }
  }

  public isAuthenticated(): boolean {
    return this.isTokenValid();
  }

  public getStoredUser(): BackendUser | null {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public setStoredUser(user: BackendUser): void {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn("Unable to save user to localStorage:", e);
    }
  }

  // ==========================================
  // CORE HTTP CLIENT
  // ==========================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
        try {
          const errorJson = await response.json();
          if (errorJson.detail) {
            errorMsg =
              typeof errorJson.detail === "string"
                ? errorJson.detail
                : JSON.stringify(errorJson.detail);
          } else if (errorJson.message) {
            errorMsg = errorJson.message;
          }
        } catch {
          // Ignore JSON parse error on error responses
        }
        throw new Error(errorMsg);
      }

      return (await response.json()) as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // ==========================================
  // 1. AUTHENTICATION & SESSION
  // ==========================================

  public async login(
    credentials: BackendLoginRequest
  ): Promise<BackendLoginResponse> {
    const res = await this.request<BackendLoginResponse>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify(credentials),
      }
    );
    if (res.access_token) {
      this.setToken(res.access_token);
    }
    if (res.user) {
      this.setStoredUser(res.user);
    }
    return res;
  }

  public async logout(): Promise<{ message: string }> {
    try {
      await this.request<{ message: string }>("/api/v1/auth/logout", {
        method: "POST",
      });
    } catch (e) {
      console.warn("Backend logout endpoint unreachable, clearing local session.");
    } finally {
      this.removeToken();
    }
    return { message: "Logged out successfully" };
  }

  // ==========================================
  // 2. CAMERA FLEET LISTING & DETAILS
  // ==========================================

  public async getCameras(): Promise<Camera[]> {
    try {
      const res = await this.request<BackendCameraListResponse>(
        "/api/v1/cameras"
      );
      if (res && Array.isArray(res.cameras) && res.cameras.length > 0) {
        return res.cameras.map((c, idx) => {
          let status: Camera["status"] = "NOT_CONNECTED";
          const rawStatus = (c.status || "").toUpperCase();
          if (rawStatus === "NOT CONNECTED" || rawStatus === "NOT_CONNECTED") {
            status = "NOT_CONNECTED";
          } else if (rawStatus === "OFFLINE" || rawStatus === "STOPPED") {
            status = "OFFLINE";
          } else if (rawStatus === "DEGRADED" || rawStatus === "MAINTENANCE") {
            status = "MAINTENANCE";
          } else if (rawStatus === "ALERT") {
            status = "ALERT";
          } else if (rawStatus === "ONLINE" || rawStatus === "ACTIVE" || rawStatus === "STREAMING") {
            status = "ACTIVE";
          } else if (!c.stream_url) {
            status = "NOT_CONNECTED";
          } else {
            status = "OFFLINE";
          }

          const isSimulated =
            c.source_type === "file" ||
            c.source_type === "simulated" ||
            (c.name || "").toUpperCase().includes("TEST STREAM") ||
            (c.name || "").startsWith("SIM-");

          let videoUrl: string | undefined = undefined;
          if (c.stream_url && status === "ACTIVE") {
            const rawUrl = c.stream_url.replace(/\\/g, "/");
            if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
              videoUrl = rawUrl;
            } else if (rawUrl.includes("storage/")) {
              const rel = rawUrl.substring(rawUrl.indexOf("storage/"));
              videoUrl = `/${rel}`;
            } else if (isSimulated) {
              const fname = rawUrl.split("/").pop() || "";
              videoUrl = `/api/v1/test-streams/video/${encodeURIComponent(fname)}`;
            }
          }
          if (!videoUrl && isSimulated && status === "ACTIVE") {
            const num = c.id && c.id.startsWith("SIM-CAM-") ? parseInt(c.id.replace("SIM-CAM-", ""), 10) : (idx + 1);
            videoUrl = `/storage/uploads/${num}.mp4`;
          }

          const camCode = (c as any).code || (c.id && (c.id.startsWith("SIM-CAM-") || c.id.startsWith("CAM-"))
            ? c.id
            : (c.name ? c.name.split(" ")[0] || `CAM-${idx + 1}` : `CAM-${idx + 1}`));

          let lastHeartbeat = "NOT CONFIGURED";
          if (c.last_seen_at) {
            lastHeartbeat = new Date(c.last_seen_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
          } else if (status === "ACTIVE") {
            lastHeartbeat = isSimulated ? "SIMULATED" : "ONLINE";
          } else if (status === "OFFLINE") {
            lastHeartbeat = "SIGNAL LOST";
          } else if (status === "NOT_CONNECTED") {
            lastHeartbeat = "NOT CONFIGURED";
          }

          return {
            id: c.id,
            code: camCode,
            name: c.name || `Camera Station ${c.id}`,
            sector: c.sector || "Sector Alpha",
            postNumber: c.location || `BP-${String(idx + 1).padStart(2, "0")}`,
            status,
            streamUrl: c.stream_url,
            isSimulated,
            videoUrl,
            resolution: isSimulated ? "720p HD (Simulated)" : (status === "ACTIVE" ? "1080p FHD" : "—"),
            fps: c.fps || 25,
            ipAddress: c.ip_address || (isSimulated ? "127.0.0.1 (SIM)" : (c.stream_url?.includes("rtsp://")
              ? c.stream_url.split("//")[1]?.split("@").pop()?.split("/")[0]?.split(":")[0] || "10.142.1.88"
              : "10.142.1.88")),
            port: c.port || (isSimulated ? 8000 : 554),
            sourceType: c.source_type || (isSimulated ? "file" : "rtsp"),
            username: c.username,
            substreamUrl: c.substream_url,
            enabled: c.enabled !== false,
            lastHeartbeat,
            personsActive: 0,
            vehiclesActive: 0,
            latitude: c.latitude ?? undefined,
            longitude: c.longitude ?? undefined,
          };
        });
      }
    } catch (err) {
      console.warn("GET /api/v1/cameras error:", err);
    }
    return [];
  }

  public async getCamera(id: string): Promise<Camera | null> {
    const list = await this.getCameras();
    return list.find((c) => c.id === id) || null;
  }

  public async createCamera(
    payload: BackendCameraCreatePayload
  ): Promise<Camera> {
    const res = await this.request<BackendCameraResponse>("/api/v1/cameras", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      id: res.id,
      code: res.name ? res.name.split(" ")[0] || `CAM-${res.id}` : `CAM-${res.id}`,
      name: res.name,
      sector: res.sector || "Sector Alpha",
      postNumber: res.location || "BP-01",
      status: "ACTIVE",
      streamUrl: res.stream_url,
      resolution: "1080p FHD",
      fps: res.fps || 25,
      ipAddress: res.ip_address || payload.ip_address || "10.142.1.88",
      port: res.port || payload.port || 554,
      sourceType: res.source_type || payload.source_type || "rtsp",
      username: res.username || payload.username,
      substreamUrl: res.substream_url || payload.substream_url,
      enabled: res.enabled !== false,
      lastHeartbeat: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      personsActive: 0,
      vehiclesActive: 0,
    };
  }

  public async updateCamera(
    id: string,
    payload: BackendCameraUpdatePayload
  ): Promise<Camera> {
    const res = await this.request<BackendCameraResponse>(
      `/api/v1/cameras/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    );
    return {
      id: res.id || id,
      code: res.name ? res.name.split(" ")[0] || `CAM-${id}` : `CAM-${id}`,
      name: res.name || "Updated Camera",
      sector: res.sector || "Sector Alpha",
      postNumber: res.location || "BP-01",
      status: (res.status?.toUpperCase() as Camera["status"]) || "ACTIVE",
      streamUrl: res.stream_url,
      resolution: "1080p FHD",
      fps: res.fps || 25,
      ipAddress: res.ip_address || payload.ip_address || "10.142.1.88",
      port: res.port || payload.port || 554,
      sourceType: res.source_type || payload.source_type || "rtsp",
      username: res.username || payload.username,
      substreamUrl: res.substream_url || payload.substream_url,
      enabled: res.enabled !== false,
      lastHeartbeat: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      personsActive: 0,
      vehiclesActive: 0,
    };
  }

  public async testCameraConnection(
    payload: CameraTestConnectionRequest
  ): Promise<CameraTestConnectionResponse> {
    return await this.request<CameraTestConnectionResponse>(
      "/api/v1/cameras/test-connection",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  public async discoverOnvifCameras(): Promise<CameraDiscoveryResponse> {
    return await this.request<CameraDiscoveryResponse>(
      "/api/v1/cameras/discover",
      {
        method: "POST",
      }
    );
  }

  public async startCamera(payload: {
    camera_id?: string;
    name?: string;
    stream_url?: string;
    source_type?: string;
    sector?: string;
    location?: string;
  }): Promise<any> {
    return await this.request<any>("/api/v1/cameras/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async stopCamera(cameraId: string): Promise<any> {
    return await this.request<any>(
      `/api/v1/cameras/${encodeURIComponent(cameraId)}/stop`,
      {
        method: "POST",
      }
    );
  }

  public async captureCameraSnapshot(cameraId: string): Promise<{
    message: string;
    evidence_id: string;
    snapshot_url: string;
    sha256: string;
    camera_id: string;
    camera_name?: string;
    sector?: string;
    timestamp: string;
    file_size_bytes?: number;
    capture_status: string;
  }> {
    return await this.request<any>(
      `/api/v1/cameras/${encodeURIComponent(cameraId)}/snapshot`,
      {
        method: "POST",
      }
    );
  }


  public async updateCameraStatus(
    id: string,
    status: "online" | "offline" | "degraded" | string
  ): Promise<boolean> {
    try {
      await this.request(`/api/v1/cameras/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      return true;
    } catch (err) {
      console.warn(`PATCH /api/v1/cameras/${id}/status error:`, err);
      return false;
    }
  }

  public async deleteCamera(id: string): Promise<boolean> {
    try {
      await this.request(`/api/v1/cameras/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return true;
    } catch (err) {
      console.warn(`DELETE /api/v1/cameras/${id} error:`, err);
      return false;
    }
  }

  // ==========================================
  // 2b. TEST VIDEO STREAMING (SIMULATED CAMERAS)
  // ==========================================

  public async getTestStreamVideos(): Promise<{
    videos: TestStreamVideo[];
    total: number;
    message: string;
  }> {
    return await this.request<{
      videos: TestStreamVideo[];
      total: number;
      message: string;
    }>("/api/v1/test-streams/videos");
  }

  public async getTestStreamingStatus(): Promise<TestStreamStatus> {
    return await this.request<TestStreamStatus>("/api/v1/test-streams/status");
  }

  public async startTestStreaming(payload: StartTestStreamPayload = {}): Promise<any> {
    return await this.request<any>("/api/v1/test-streams/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async stopTestStreaming(payload: StopTestStreamPayload = {}): Promise<any> {
    return await this.request<any>("/api/v1/test-streams/stop", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async pauseTestStream(cameraId: string): Promise<any> {
    return await this.request<any>(`/api/v1/test-streams/${encodeURIComponent(cameraId)}/pause`, {
      method: "POST",
    });
  }

  public async resumeTestStream(cameraId: string): Promise<any> {
    return await this.request<any>(`/api/v1/test-streams/${encodeURIComponent(cameraId)}/resume`, {
      method: "POST",
    });
  }

  public async replayTestStream(cameraId: string): Promise<any> {
    return await this.request<any>(`/api/v1/test-streams/${encodeURIComponent(cameraId)}/replay`, {
      method: "POST",
    });
  }

  public async setTestStreamLoop(cameraId: string, loop: boolean): Promise<any> {
    return await this.request<any>(`/api/v1/test-streams/${encodeURIComponent(cameraId)}/loop`, {
      method: "POST",
      body: JSON.stringify({ loop }),
    });
  }

  public async stopSingleTestStream(cameraId: string): Promise<any> {
    return await this.request<any>(`/api/v1/test-streams/${encodeURIComponent(cameraId)}/stop`, {
      method: "POST",
    });
  }

  public async batchStartTestStreams(streams: StartTestStreamPayload[]): Promise<any> {
    return await this.request<any>("/api/v1/test-streams/batch-start", {
      method: "POST",
      body: JSON.stringify({ streams }),
    });
  }

  public async uploadTestVideos(formData: FormData): Promise<{
    message: string;
    uploaded_files: string[];
    total_videos: number;
    fleet: any[];
  }> {
    const url = `${this.baseUrl}/api/v1/test-streams/upload`;
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!response.ok) {
      let errMsg = "Failed to upload video files";
      try {
        const err = await response.json();
        errMsg = err.detail || err.message || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
    return await response.json();
  }

  public async deleteTestVideo(videoId: string): Promise<{
    message: string;
    deleted_camera_id?: string;
    remaining_videos: number;
  }> {
    return await this.request<{
      message: string;
      deleted_camera_id?: string;
      remaining_videos: number;
    }>(`/api/v1/test-streams/videos/${encodeURIComponent(videoId)}`, {
      method: "DELETE",
    });
  }

  public async syncSimulatedCameras(): Promise<any> {
    return await this.request<any>("/api/v1/test-streams/sync-cameras", {
      method: "POST",
    });
  }

  // ==========================================
  // 3. CAMERA HEALTH MAP
  // ==========================================

  public async getCameraHealth(): Promise<BackendCameraHealthMap> {
    try {
      const res = await this.request<{
        cameras: BackendCameraHealthMap;
        total: number;
      }>("/api/v1/cameras/health");
      if (res && res.cameras) {
        return res.cameras;
      }
    } catch (err) {
      console.warn("GET /api/v1/cameras/health error:", err);
    }
    return {};
  }

  // ==========================================
  // 4. OPERATIONAL STATISTICS & SYSTEM HEALTH
  // ==========================================

  public async getStatistics(): Promise<SystemMetrics> {
    const emptyMetrics: SystemMetrics = {
      totalCameras: 0,
      activeCameras: 0,
      offlineCameras: 0,
      maintenanceCameras: 0,
      personsDetected: 0,
      vehiclesDetected: 0,
      criticalAlerts: 0,
      warningsToday: 0,
      streamLatencyMs: 0,
      networkThroughputMbps: 0,
      operationalStatus: "IDLE",
      defconLevel: "DEFCON-5 (NORMAL)",
    };

    try {
      const stats = await this.request<BackendStatisticsResponse>(
        "/api/v1/statistics"
      );

      if (stats) {
        return {
          totalCameras: stats.total_cameras ?? 0,
          activeCameras: stats.active_cameras ?? 0,
          offlineCameras: stats.offline_cameras ?? 0,
          maintenanceCameras: stats.degraded_cameras ?? 0,
          personsDetected: stats.total_persons ?? 0,
          vehiclesDetected: stats.total_vehicles ?? 0,
          criticalAlerts: stats.critical_alerts ?? 0,
          warningsToday: stats.high_alerts ?? 0,
          streamLatencyMs: stats.stream_latency_ms ?? 0,
          networkThroughputMbps: stats.network_mbps ?? 0,
          operationalStatus: stats.total_cameras && stats.total_cameras > 0 ? "MONITORING ACTIVE" : "IDLE (0 CAMERAS)",
          defconLevel: stats.critical_alerts && stats.critical_alerts > 0 ? "DEFCON-2 (HIGH ALERT)" : "DEFCON-4 (ROUTINE PATROL)",
        };
      }
    } catch (err) {
      console.warn("GET /api/v1/statistics error:", err);
    }
    return emptyMetrics;
  }

  public async getSystemHealth(): Promise<BackendSystemHealthResponse | null> {
    try {
      return await this.request<BackendSystemHealthResponse>(
        "/api/v1/system/health"
      );
    } catch (err) {
      console.warn("GET /api/v1/system/health error:", err);
      return null;
    }
  }

  // ==========================================
  // 5. SURVEILLANCE EVENTS & ALERTS
  // ==========================================

  public async getAlerts(): Promise<SecurityAlert[]> {
    try {
      const res = await this.request<{
        alerts?: BackendEventResponse[];
        events?: BackendEventResponse[];
        total?: number;
      }>("/api/v1/alerts");

      const items = res.alerts || res.events;
      if (Array.isArray(items) && items.length > 0) {
        return items.map((ev, idx) => {
          let severity: SecurityAlert["severity"] = "advisory";
          const sevStr = (ev.severity || "").toLowerCase();
          if (sevStr === "critical" || sevStr === "high") severity = "critical";
          else if (sevStr === "medium" || sevStr === "warn") severity = "warning";

          let status: SecurityAlert["status"] = "unresolved";
          const stStr = (ev.status || "").toLowerCase();
          if (stStr === "acknowledged" || stStr === "investigating")
            status = "investigating";
          else if (stStr === "resolved" || stStr === "closed")
            status = "resolved";

          const rawPlateImg = ev.plate_image_url || ev.extra_data?.plate_image_url;
          const rawSnapImg = ev.snapshot_url || ev.extra_data?.snapshot_url;
          const plateNum = ev.plate_number || ev.extra_data?.plate_number;
          const evStatus = ev.evidence_status || ev.extra_data?.evidence_status || (rawPlateImg || rawSnapImg ? "SUCCESS" : undefined);

          return {
            id: ev.id,
            code: `ALT-${ev.id.slice(-6).toUpperCase()}`,
            title: ev.title || `${(ev.event_type || "SURVEILLANCE").toUpperCase()} DETECTED`,
            description:
              ev.description ||
              `Event trigger on camera ${ev.camera_id} in ${ev.sector || "Border Sector"}.`,
            cameraId: ev.camera_id,
            cameraCode: ev.camera_name || `CAM-${ev.camera_id.slice(-4)}`,
            sector: ev.sector || "Sector Alpha",
            severity,
            timestamp: ev.timestamp
              ? new Date(ev.timestamp).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : new Date().toLocaleTimeString("en-IN"),
            status,
            assignedUnit: "Border Patrol QRT",
            plateNumber: plateNum,
            plateImageUrl: rawPlateImg ? this.resolveMediaUrl(rawPlateImg) : undefined,
            snapshotUrl: rawSnapImg ? this.resolveMediaUrl(rawSnapImg) : undefined,
            evidenceStatus: evStatus,
          };
        });
      }
    } catch (err) {
      console.warn("GET /api/v1/alerts error:", err);
    }
    return [];
  }

  public async getEvents(params?: {
    camera_id?: string;
    event_type?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<BackendEventResponse[]> {
    try {
      const q = new URLSearchParams();
      if (params?.camera_id) q.append("camera_id", params.camera_id);
      if (params?.event_type) q.append("event_type", params.event_type);
      if (params?.severity) q.append("severity", params.severity);
      if (params?.limit) q.append("limit", params.limit.toString());
      if (params?.offset) q.append("offset", params.offset.toString());

      const res = await this.request<{ events?: BackendEventResponse[]; total?: number } | BackendEventResponse[]>(
        `/api/v1/events?${q.toString()}`
      );

      const items = Array.isArray(res) ? res : res?.events || [];
      return items.map((e) => ({
        ...e,
        plate_image_url: e.plate_image_url ? this.resolveMediaUrl(e.plate_image_url) : undefined,
        snapshot_url: e.snapshot_url ? this.resolveMediaUrl(e.snapshot_url) : undefined,
      }));
    } catch (err) {
      console.warn("GET /api/v1/events error:", err);
      return [];
    }
  }

  public async getEvidenceById(evidenceId: string): Promise<BackendEvidenceItem | null> {
    try {
      const res = await this.request<BackendEvidenceItem>(
        `/api/v1/evidence/${encodeURIComponent(evidenceId)}`
      );
      if (res && res.id) {
        return {
          ...res,
          image_path: res.image_path ? this.resolveMediaUrl(res.image_path) : undefined,
          plate_image_path: res.plate_image_path ? this.resolveMediaUrl(res.plate_image_path) : undefined,
          plate_image_url: res.plate_image_url ? this.resolveMediaUrl(res.plate_image_url) : undefined,
          snapshot_url: res.snapshot_url ? this.resolveMediaUrl(res.snapshot_url) : undefined,
        };
      }
    } catch (err) {
      console.warn(`GET /api/v1/evidence/${evidenceId} error:`, err);
    }
    return null;
  }

  public async acknowledgeEvent(eventId: string): Promise<boolean> {
    try {
      await this.request(`/api/v1/events/${eventId}/acknowledge`, {
        method: "PATCH",
        body: JSON.stringify({ status: "acknowledged" }),
      });
      return true;
    } catch (err) {
      console.warn(`PATCH /api/v1/events/${eventId}/acknowledge error:`, err);
      return false;
    }
  }

  public async resolveEvent(eventId: string): Promise<boolean> {
    try {
      await this.request(`/api/v1/events/${eventId}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" }),
      });
      return true;
    } catch (err) {
      console.warn(`PATCH /api/v1/events/${eventId}/resolve error:`, err);
      return false;
    }
  }

  // ==========================================
  // 6. DETECTION HISTORY LOG
  // ==========================================

  public async getDetections(
    cameraId?: string,
    limit: number = 50
  ): Promise<DetectionItem[]> {
    try {
      const queryParams = new URLSearchParams();
      if (cameraId) queryParams.append("camera_id", cameraId);
      queryParams.append("limit", limit.toString());

      const res = await this.request<BackendDetectionListResponse>(
        `/api/v1/detections?${queryParams.toString()}`
      );

      if (res && Array.isArray(res.detections) && res.detections.length > 0) {
        return res.detections.map((d, idx) => {
          let type: DetectionItem["type"] = "object";
          const cls = (d.class_name || "").toLowerCase();
          if (cls.includes("person") || cls.includes("human")) type = "person";
          else if (
            cls.includes("car") ||
            cls.includes("vehicle") ||
            cls.includes("truck") ||
            cls.includes("motorcycle") ||
            cls.includes("bus")
          )
            type = "vehicle";
          else if (cls.includes("breach") || cls.includes("intrusion"))
            type = "breach";

          return {
            id: d.id,
            cameraId: d.camera_id,
            cameraCode: d.camera_code || `CAM-${d.camera_id.slice(-4)}`,
            sector: d.sector || "Sector Alpha",
            type,
            label: `${(d.class_name || "OBJECT").toUpperCase()}${d.track_id ? ` #${d.track_id}` : ""}`,
            confidence: d.confidence || 0.85,
            timestamp: d.timestamp
              ? new Date(d.timestamp).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : new Date().toLocaleTimeString("en-IN"),
            severity: type === "breach" ? "critical" : d.confidence > 0.8 ? "normal" : "warn",
            details: d.track_id ? `ByteTrack Target #${d.track_id}` : undefined,
          };
        });
      }
    } catch (err) {
      console.warn("GET /api/v1/detections error:", err);
    }
    return [];
  }

  // ==========================================
  // 7. INCIDENT DOSSIER & WORKFLOW ACTIONS
  // ==========================================

  public async getIncident(
    incidentId: string,
    fallback?: {
      title?: string;
      sector?: string;
      reportNumber?: string;
      incidentDate?: string;
      reportingOfficer?: string;
      summary?: string;
      status?: string;
    }
  ): Promise<BackendIncidentDetail> {
    try {
      const res = await this.request<any>(
        `/api/v1/incidents/${encodeURIComponent(incidentId)}`
      );
      if (res && (res.id || res.title)) {
        return {
          id: res.id || incidentId,
          reportNumber: res.reportNumber || res.report_number || fallback?.reportNumber || `IR-${incidentId.slice(-6).toUpperCase()}`,
          title: res.title || fallback?.title || "Incident Report",
          sector: res.sector || fallback?.sector || "Sector Alpha",
          status: (res.status?.toUpperCase() as any) || fallback?.status || "ACTIVE",
          classification: res.classification || "Restricted",
          incidentDate: res.incidentDate || res.created_at?.slice(0, 10) || fallback?.incidentDate || new Date().toISOString().slice(0, 10),
          generatedAt: res.generatedAt || res.created_at || new Date().toISOString(),
          reportingOfficer: res.reportingOfficer || res.assigned_to || fallback?.reportingOfficer || "Border Duty Officer",
          summary: res.summary || res.description || fallback?.summary || "Automated surveillance alert.",
          explanationSteps: res.explanationSteps || res.explanation_steps || [],
          timeline: res.timeline || [],
          notes: res.notes || [],
        };
      }
    } catch (err) {
      console.warn(`GET /api/v1/incidents/${incidentId} error:`, err);
    }

    return {
      id: incidentId,
      reportNumber: fallback?.reportNumber || `IR-${incidentId.slice(-6).toUpperCase()}`,
      title: fallback?.title || "Surveillance Incident",
      sector: fallback?.sector || "Sector Alpha",
      status: fallback?.status || "Under Review",
      classification: "Restricted",
      incidentDate: fallback?.incidentDate || new Date().toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      reportingOfficer: fallback?.reportingOfficer || "Duty Officer",
      summary: fallback?.summary || "Automated border alert.",
      explanationSteps: [],
      timeline: [],
      notes: [],
    };
  }

  public async acknowledgeIncident(incidentId: string): Promise<boolean> {
    try {
      await this.request(`/api/v1/incidents/${encodeURIComponent(incidentId)}/acknowledge`, {
        method: "PATCH",
        body: JSON.stringify({ status: "acknowledged" }),
      });
      return true;
    } catch (err) {
      console.warn(`PATCH /api/v1/incidents/${incidentId}/acknowledge error:`, err);
      return false;
    }
  }

  public async escalateIncident(incidentId: string): Promise<boolean> {
    try {
      await this.request(`/api/v1/incidents/${encodeURIComponent(incidentId)}/escalate`, {
        method: "PATCH",
        body: JSON.stringify({ status: "escalated", escalation_level: "COMMAND_HQ" }),
      });
      return true;
    } catch (err) {
      console.warn(`PATCH /api/v1/incidents/${incidentId}/escalate error:`, err);
      return false;
    }
  }

  public async resolveIncident(incidentId: string, notes?: string): Promise<boolean> {
    try {
      await this.request(`/api/v1/incidents/${encodeURIComponent(incidentId)}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", resolution_notes: notes || "Resolved by operator" }),
      });
      return true;
    } catch (err) {
      console.warn(`PATCH /api/v1/incidents/${incidentId}/resolve error:`, err);
      return false;
    }
  }

  public async addIncidentNote(
    incidentId: string,
    text: string,
    author: string = "Duty Officer",
    role: string = "Investigating Officer"
  ): Promise<IncidentNote> {
    const newNote: IncidentNote = {
      id: `note-${Date.now()}`,
      author,
      role,
      text,
      timestamp: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) + " IST",
    };

    try {
      const res = await this.request<any>(`/api/v1/incidents/${encodeURIComponent(incidentId)}/notes`, {
        method: "POST",
        body: JSON.stringify({ author, role, text }),
      });
      if (res && res.id) {
        return {
          id: res.id,
          author: res.author || author,
          role: res.role || role,
          text: res.text || text,
          timestamp: res.timestamp || newNote.timestamp,
        };
      }
    } catch (err) {
      console.warn(`POST /api/v1/incidents/${incidentId}/notes error:`, err);
    }
    return newNote;
  }

  public async getIncidents(): Promise<any[]> {
    try {
      const res = await this.request<any>("/api/v1/incidents");
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.incidents)) return res.incidents;
    } catch (e) {
      console.warn("GET /api/v1/incidents error:", e);
    }
    return [];
  }

  // ==========================================
  // 8. EVIDENCE MEDIA & SHA-256 INTEGRITY
  // ==========================================

  public async getEvidenceList(): Promise<BackendEvidenceItem[]> {
    try {
      const res = await this.request<any>("/api/v1/evidence");
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.evidence)) return res.evidence;
    } catch (err) {
      console.warn("GET /api/v1/evidence error:", err);
    }
    return [];
  }

  public async getIncidentEvidence(incidentId: string): Promise<BackendEvidenceItem[]> {
    try {
      const res = await this.request<any>(
        `/api/v1/evidence/incident/${encodeURIComponent(incidentId)}`
      );
      if (Array.isArray(res)) {
        return res;
      }
      if (res && Array.isArray(res.evidence)) {
        return res.evidence;
      }
      if (res && res.id) {
        return [res];
      }
    } catch (err) {
      console.warn(`GET /api/v1/evidence/incident/${incidentId} error:`, err);
    }
    return [];
  }

  public async verifyEvidence(evidenceId: string): Promise<EvidenceVerificationResult> {
    try {
      const res = await this.request<any>(
        `/api/v1/evidence/${encodeURIComponent(evidenceId)}/verify`,
        { method: "POST" }
      );
      if (res && res.sha256) {
        return {
          valid: res.valid !== false,
          sha256: res.sha256 || res.calculated_hash || "",
          stored_hash: res.stored_hash || "",
          calculated_hash: res.calculated_hash || res.sha256 || "",
          verification_result: res.verification_result || res.auditStatus || "VERIFIED",
          timestamp: res.timestamp || new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn(`POST /api/v1/evidence/${evidenceId}/verify error:`, err);
    }

    return {
      valid: false,
      sha256: "N/A",
      stored_hash: "N/A",
      calculated_hash: "N/A",
      verification_result: "UNVERIFIED (BACKEND UNREACHABLE)",
      timestamp: new Date().toLocaleTimeString("en-IN"),
    };
  }

  // ==========================================
  // 9. CRYPTOGRAPHIC AUDIT LEDGER & CHAIN VERIFY
  // ==========================================

  public async getAuditLogs(): Promise<AuditRecord[]> {
    try {
      const res = await this.request<any>("/api/v1/audit");
      const records = Array.isArray(res) ? res : res?.records || res?.logs;
      if (Array.isArray(records) && records.length > 0) {
        return records.map((r: any, idx: number) => ({
          id: r.id || `audit-${idx + 1}`,
          sequence: r.sequence || idx + 1,
          timestamp: r.timestamp
            ? (r.timestamp.includes("T")
                ? new Date(r.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                : r.timestamp)
            : new Date().toLocaleTimeString("en-IN"),
          action: r.action || "Terminal Operation",
          operator: r.operatorName || r.operator || "System Operator",
          operatorId: r.operatorId || "SEC-SYS",
          status: (r.status?.toUpperCase() as any) || "OK",
          record_hash: r.record_hash || r.recordHash || r.hash || "",
          details: r.details,
        }));
      }
    } catch (err) {
      console.warn("GET /api/v1/audit error:", err);
    }
    return [];
  }

  public async verifyAuditChain(): Promise<AuditVerificationResponse> {
    try {
      const res = await this.request<any>("/api/v1/audit/verify");
      if (res && res.valid !== undefined) {
        return {
          valid: Boolean(res.valid),
          records_checked: res.records_checked || res.recordsChecked || 0,
          latest_hash: res.latest_hash || res.latestHash || "",
          errors: Array.isArray(res.errors) ? res.errors : [],
          timestamp: res.timestamp || new Date().toLocaleTimeString("en-IN"),
        };
      }
    } catch (err) {
      console.warn("GET /api/v1/audit/verify error:", err);
    }

    return {
      valid: false,
      records_checked: 0,
      latest_hash: "",
      errors: ["Audit verification endpoint unreachable"],
      timestamp: new Date().toLocaleTimeString("en-IN"),
    };
  }

  // ==========================================
  // 10. CAMERA DIAGNOSTICS & WATCHDOG REBOOT
  // ==========================================

  public async getCameraDiagnostics(cameraId: string): Promise<CameraDiagnostics> {
    try {
      const res = await this.request<any>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/diagnostics`
      );
      if (res && (res.latency_ms !== undefined || res.latencyMs !== undefined)) {
        return {
          camera_id: cameraId,
          camera_name: res.camera_name || res.cameraName,
          measured_fps: res.measured_fps || res.measuredFps || 0,
          configured_fps: res.configured_fps || res.fps || 25,
          latency_ms: res.latency_ms || res.latencyMs || 0,
          packet_loss_pct: res.packet_loss_pct || res.packetLoss || 0,
          sensor_status: res.sensor_status || res.status || "HEALTHY",
          frames_processed: res.frames_processed || res.framesProcessed || 0,
          resolution: res.resolution || "1080p FHD",
          codec: res.codec || "H.264 / ONVIF",
          last_ping: res.last_ping || new Date().toLocaleTimeString("en-IN"),
        };
      }
    } catch (err) {
      console.warn(`GET /api/v1/cameras/${cameraId}/diagnostics error:`, err);
    }

    return {
      camera_id: cameraId,
      measured_fps: 0,
      configured_fps: 25,
      latency_ms: 0,
      packet_loss_pct: 0,
      sensor_status: "UNKNOWN",
      frames_processed: 0,
      resolution: "1080p FHD",
      codec: "H.264",
      last_ping: "N/A",
    };
  }

  public async rebootCamera(cameraId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.request<any>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/reboot`,
        { method: "POST" }
      );
      return {
        success: true,
        message: res?.message || `Camera ${cameraId} reboot sequence initiated.`,
      };
    } catch (err) {
      console.warn(`POST /api/v1/cameras/${cameraId}/reboot error:`, err);
      return {
        success: false,
        message: `Failed to communicate with camera watchdog ${cameraId}.`,
      };
    }
  }

  // ==========================================
  // 11. PTZ CAMERA CONTROLS (ONVIF & SIMULATED)
  // ==========================================

  public async getPtzCapabilities(cameraId: string): Promise<PtzCapabilitiesResponse> {
    try {
      const res = await this.request<PtzCapabilitiesResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/ptz/capabilities`
      );
      if (res && res.ptz_supported !== undefined) return res;
    } catch (err) {
      console.warn(`GET /api/v1/cameras/${cameraId}/ptz/capabilities error:`, err);
    }
    return {
      camera_id: cameraId,
      ptz_supported: false,
      is_simulated_viewport: false,
      presets_supported: false,
      continuous_move_supported: false,
      relative_move_supported: false,
      stop_supported: false,
      speed_range: { min: 0.1, max: 1.0, default: 0.5 },
      message: "PTZ capabilities unavailable",
    };
  }

  public async ptzContinuousMove(cameraId: string, payload: PtzMoveRequest): Promise<PtzActionResponse> {
    try {
      return await this.request<PtzActionResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/ptz/move`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
    } catch (err) {
      console.warn(`POST /api/v1/cameras/${cameraId}/ptz/move error:`, err);
      return {
        status: "error",
        camera_id: cameraId,
        action: "continuous_move",
        is_simulated_viewport: false,
        message: "Failed to send PTZ move command",
      };
    }
  }

  public async ptzRelativeMove(cameraId: string, payload: PtzMoveRequest): Promise<PtzActionResponse> {
    try {
      return await this.request<PtzActionResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/ptz/relative`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
    } catch (err) {
      console.warn(`POST /api/v1/cameras/${cameraId}/ptz/relative error:`, err);
      return {
        status: "error",
        camera_id: cameraId,
        action: "relative_move",
        is_simulated_viewport: false,
        message: "Failed to send PTZ relative move command",
      };
    }
  }

  public async ptzStop(cameraId: string): Promise<PtzActionResponse> {
    try {
      return await this.request<PtzActionResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/ptz/stop`,
        {
          method: "POST",
        }
      );
    } catch (err) {
      console.warn(`POST /api/v1/cameras/${cameraId}/ptz/stop error:`, err);
      return {
        status: "error",
        camera_id: cameraId,
        action: "stop",
        is_simulated_viewport: false,
        message: "Failed to send PTZ stop command",
      };
    }
  }

  public async getPtzPresets(cameraId: string): Promise<PtzPreset[]> {
    try {
      const res = await this.request<PtzPresetsResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/ptz/presets`
      );
      return res?.presets || [];
    } catch (err) {
      console.warn(`GET /api/v1/cameras/${cameraId}/ptz/presets error:`, err);
      return [];
    }
  }

  public async gotoPtzPreset(cameraId: string, presetToken: string): Promise<PtzActionResponse> {
    try {
      return await this.request<PtzActionResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/ptz/presets/goto`,
        {
          method: "POST",
          body: JSON.stringify({ preset_token: presetToken }),
        }
      );
    } catch (err) {
      console.warn(`POST /api/v1/cameras/${cameraId}/ptz/presets/goto error:`, err);
      return {
        status: "error",
        camera_id: cameraId,
        action: "goto_preset",
        is_simulated_viewport: false,
        message: "Failed to navigate to preset",
      };
    }
  }

  public async createPtzPreset(cameraId: string, presetName?: string): Promise<PtzActionResponse> {
    try {
      return await this.request<PtzActionResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/ptz/presets`,
        {
          method: "POST",
          body: JSON.stringify({ preset_name: presetName || `Preset_${Date.now()}` }),
        }
      );
    } catch (err) {
      console.warn(`POST /api/v1/cameras/${cameraId}/ptz/presets error:`, err);
      return {
        status: "error",
        camera_id: cameraId,
        action: "create_preset",
        is_simulated_viewport: false,
        message: "Failed to save preset",
      };
    }
  }

  // ==========================================
  // 12. THERMAL IMAGING CONTROLS
  // ==========================================

  public async getThermalStatus(cameraId: string): Promise<ThermalStatusResponse> {
    try {
      return await this.request<ThermalStatusResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/thermal`
      );
    } catch (err) {
      console.warn(`GET /api/v1/cameras/${cameraId}/thermal error:`, err);
      return {
        camera_id: cameraId,
        thermal_capable: false,
        thermal_mode: "off",
        radiometric: false,
        is_simulated: true,
        description: "Thermal status unavailable",
        temperature_support: false,
      };
    }
  }

  public async setThermalConfig(cameraId: string, payload: ThermalConfigRequest): Promise<ThermalStatusResponse> {
    try {
      return await this.request<ThermalStatusResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/thermal`,
        {
          method: "POST",
          body: JSON.stringify({
            enabled: payload.enabled,
            palette: payload.colormap || "ironbow",
            simulate_on_rgb: true,
          }),
        }
      );
    } catch (err) {
      console.warn(`POST /api/v1/cameras/${cameraId}/thermal error:`, err);
      throw err;
    }
  }

  // ==========================================
  // 13. NIGHT VISION & IR CONTROLS
  // ==========================================

  public async getNightVisionStatus(cameraId: string): Promise<NightVisionStatusResponse> {
    try {
      return await this.request<NightVisionStatusResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/night-vision`
      );
    } catch (err) {
      console.warn(`GET /api/v1/cameras/${cameraId}/night-vision error:`, err);
      return {
        camera_id: cameraId,
        mode: "auto",
        ir_filter_state: "unknown",
        hardware_ir_supported: false,
        digital_enhancement_active: false,
        is_simulated: true,
        description: "Night vision status unavailable",
      };
    }
  }

  public async setNightVisionConfig(cameraId: string, payload: NightVisionConfigRequest): Promise<NightVisionStatusResponse> {
    try {
      return await this.request<NightVisionStatusResponse>(
        `/api/v1/cameras/${encodeURIComponent(cameraId)}/night-vision`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
    } catch (err) {
      console.warn(`POST /api/v1/cameras/${cameraId}/night-vision error:`, err);
      throw err;
    }
  }

  // ==========================================
  // 14. VIRTUAL FENCING & HITL CONFIRMATION
  // ==========================================

  public async listZones(cameraId?: string, includeUnconfirmed: boolean = true): Promise<any[]> {
    const query = new URLSearchParams();
    if (cameraId) query.append("camera_id", cameraId);
    query.append("include_unconfirmed", String(includeUnconfirmed));
    return await this.request<any[]>(`/api/v1/zones?${query.toString()}`);
  }

  public async getZones(cameraId?: string): Promise<any[]> {
    return this.listZones(cameraId);
  }

  public async createZone(payload: any): Promise<any> {
    return await this.request<any>("/api/v1/zones", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async confirmZone(zoneId: string, payload: any): Promise<any> {
    return await this.request<any>(`/api/v1/zones/${encodeURIComponent(zoneId)}/confirm`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async rejectZone(zoneId: string, reason?: string): Promise<any> {
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return await this.request<any>(`/api/v1/zones/${encodeURIComponent(zoneId)}/reject${query}`, {
      method: "POST",
    });
  }

  public async updateZone(zoneId: string, payload: any): Promise<any> {
    return await this.request<any>(`/api/v1/zones/${encodeURIComponent(zoneId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  public async deleteZone(zoneId: string): Promise<{ message: string }> {
    return await this.request<{ message: string }>(`/api/v1/zones/${encodeURIComponent(zoneId)}`, {
      method: "DELETE",
    });
  }

  public async detectCameraBoundaries(cameraId: string): Promise<any> {
    return await this.request<any>(`/api/v1/cameras/${encodeURIComponent(cameraId)}/detect-boundaries`, {
      method: "POST",
    });
  }

  public async getRuleSettings(): Promise<any> {
    return await this.request<any>("/api/v1/rules/settings");
  }

  public async updateRuleSettings(payload: any): Promise<any> {
    return await this.request<any>("/api/v1/rules/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  // ==========================================
  // 15. LOCAL DEV CAMERA TESTING (DEV ONLY)
  // ==========================================

  public async getLocalCameras(): Promise<{ devices: any[]; total: number }> {
    return await this.request<{ devices: any[]; total: number }>("/api/v1/devtools/local-cameras");
  }

  public async startLocalCamera(payload: { device_index?: number | string; name?: string; sector?: string } = {}): Promise<any> {
    return await this.request<any>("/api/v1/devtools/local-cameras/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  public async stopLocalCamera(payload: { device_index?: number | string; camera_id?: string } = {}): Promise<any> {
    return await this.request<any>("/api/v1/devtools/local-cameras/stop", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export const api = new ApiService();
