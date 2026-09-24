import { useState, useEffect } from "react";
import { SecurityAlert, DetectionItem } from "../types";

export type WsConnectionStatus = "connected" | "connecting" | "disconnected";

export interface WsMessagePayload {
  type: string;
  message?: string;
  event?: any;
  alert?: any;
  detection?: any;
  [key: string]: any;
}

const WS_BASE_URL = (() => {
  const httpUrl =
    (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";
  return httpUrl.replace(/^http/, "ws").replace(/\/$/, "");
})();

class WebSocketService {
  private socket: WebSocket | null = null;
  private status: WsConnectionStatus = "disconnected";
  private pingIntervalId: any = null;
  private reconnectTimeoutId: any = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private seenIds: Set<string> = new Set();
  private maxSeenIds = 500;

  // Listeners
  private statusListeners: Set<(status: WsConnectionStatus) => void> = new Set();
  private alertListeners: Set<(alert: SecurityAlert) => void> = new Set();
  private detectionListeners: Set<(detection: DetectionItem) => void> = new Set();

  public getStatus(): WsConnectionStatus {
    return this.status;
  }

  private setStatus(newStatus: WsConnectionStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((listener) => listener(newStatus));
    }
  }

  public subscribeStatus(listener: (status: WsConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public subscribeAlerts(listener: (alert: SecurityAlert) => void): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  public subscribeDetections(listener: (detection: DetectionItem) => void): () => void {
    this.detectionListeners.add(listener);
    return () => this.detectionListeners.delete(listener);
  }

  public connect(): void {
    // Prevent duplicate active connections
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.setStatus("connecting");
    const wsUrl = `${WS_BASE_URL}/api/v1/ws`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.setStatus("connected");
        this.reconnectAttempts = 0;
        this.startPing();
      };

      this.socket.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.socket.onerror = (err) => {
        console.warn("WebSocket connection error:", err);
      };

      this.socket.onclose = () => {
        this.stopPing();
        this.setStatus("disconnected");
        this.scheduleReconnect();
      };
    } catch (e) {
      console.warn("Failed to instantiate WebSocket:", e);
      this.setStatus("disconnected");
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.stopPing();
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.socket) {
      // Remove event handlers to prevent reconnect loop during intentional close
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.close();
      this.socket = null;
    }
    this.setStatus("disconnected");
  }

  private startPing(): void {
    this.stopPing();
    this.pingIntervalId = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ type: "ping" }));
        } catch {
          // Socket might have closed
        }
      }
    }, 25000);
  }

  private stopPing(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.info("Max WebSocket reconnect attempts reached. Standing by.");
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(1.8, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;

    if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, backoffMs);
  }

  private isDuplicate(id: string): boolean {
    if (!id) return false;
    if (this.seenIds.has(id)) {
      return true;
    }
    this.seenIds.add(id);
    if (this.seenIds.size > this.maxSeenIds) {
      const first = this.seenIds.values().next().value;
      if (first) this.seenIds.delete(first);
    }
    return false;
  }

  private handleMessage(data: string): void {
    // 1. Text pongs
    if (data === "pong" || data === "PONG") {
      return;
    }

    let payload: WsMessagePayload;
    try {
      payload = JSON.parse(data);
    } catch {
      // Non-JSON message e.g. "CONNECTED"
      if (data.includes("CONNECTED")) {
        this.setStatus("connected");
      }
      return;
    }

    // 2. Pong payloads
    if (payload.type === "pong" || payload.type === "PONG") {
      return;
    }

    // 3. Connection acknowledgment
    if (payload.type === "CONNECTED") {
      this.setStatus("connected");
      return;
    }

    // 4. Handle Alert Events (alert.new or SURVEILLANCE_EVENT)
    if (payload.type === "alert.new" || payload.type === "SURVEILLANCE_EVENT") {
      const rawEvent = payload.event || payload.alert || payload;
      const eventId = rawEvent.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      if (this.isDuplicate(eventId)) {
        return; // Prevent duplicate events
      }

      const alert = this.normalizeAlert(rawEvent, eventId);
      this.alertListeners.forEach((listener) => listener(alert));

      // If payload also contains detection details, broadcast to detection log
      if (rawEvent.detection || rawEvent.bbox || rawEvent.class_name) {
        const detection = this.normalizeDetection(rawEvent.detection || rawEvent);
        this.detectionListeners.forEach((listener) => listener(detection));
      }
    }
  }

  private normalizeAlert(ev: any, id: string): SecurityAlert {
    let severity: SecurityAlert["severity"] = "advisory";
    const s = (ev.severity || "").toLowerCase();
    if (s === "critical" || s === "high") severity = "critical";
    else if (s === "medium" || s === "warn") severity = "warning";

    const timestamp = ev.timestamp
      ? new Date(ev.timestamp).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

    return {
      id,
      code: ev.code || `ALT-${new Date().getFullYear()}-${id.slice(-4).toUpperCase()}`,
      title: ev.title || `${(ev.event_type || "Surveillance").toUpperCase()} DETECTED`,
      description:
        ev.description ||
        `Live automated perimeter trigger on camera ${ev.camera_id || "CAM-01"}.`,
      cameraId: ev.camera_id || "cam-01",
      cameraCode: ev.camera_name || `CAM-${(ev.camera_id || "01").slice(-4).toUpperCase()}`,
      sector: ev.sector || "Sector Alpha",
      severity,
      timestamp,
      status: "unresolved",
      assignedUnit: "48th Bn QRT",
    };
  }

  private normalizeDetection(det: any): DetectionItem {
    const rawClass = (det.class_name || det.type || "object").toLowerCase();
    let type: DetectionItem["type"] = "object";
    if (rawClass.includes("person") || rawClass.includes("human")) type = "person";
    else if (
      rawClass.includes("vehicle") ||
      rawClass.includes("car") ||
      rawClass.includes("truck") ||
      rawClass.includes("motorcycle") ||
      rawClass.includes("bus")
    )
      type = "vehicle";
    else if (rawClass.includes("breach") || rawClass.includes("intrusion"))
      type = "breach";

    return {
      id: det.id || `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cameraId: det.camera_id || "cam-01",
      cameraCode: det.camera_code || "CAM-01",
      sector: det.sector || "Sector Alpha",
      type,
      label: `${(det.class_name || type).toUpperCase()}${det.track_id ? ` #${det.track_id}` : ""}`,
      confidence: det.confidence || 0.88,
      timestamp: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      severity: type === "breach" ? "critical" : det.confidence > 0.8 ? "normal" : "warn",
      details: det.track_id ? `ByteTrack Target #${det.track_id}` : undefined,
    };
  }
}

export const wsService = new WebSocketService();

export function useWebSocketStatus(): WsConnectionStatus {
  const [status, setStatus] = useState<WsConnectionStatus>(wsService.getStatus());

  useEffect(() => {
    return wsService.subscribeStatus((newStatus) => {
      setStatus(newStatus);
    });
  }, []);

  return status;
}
