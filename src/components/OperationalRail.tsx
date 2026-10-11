import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DetectionItem, SecurityAlert, SystemMetrics } from "../types";
import { api } from "../services/api";
import { wsService } from "../services/websocket";
import { useSurveillanceStream } from "../context/SurveillanceStreamContext";
import StatusBadge from "./StatusBadge";
import EvidenceModal, { EvidenceModalData } from "./EvidenceModal";

const detectionTypeLabel: Record<string, string> = {
  breach: "BREACH",
  person: "PERSON",
  vehicle: "VEHICLE",
  object: "OBJECT",
};

const detectionTypeBadge: Record<string, string> = {
  breach: "bg-status-criticalBg text-status-critical border-status-critical/30",
  person: "bg-navy-100 text-navy-700 border-navy-200",
  vehicle: "bg-status-infoBg text-status-info border-status-info/20",
  object: "bg-status-warnBg text-status-warn border-status-warn/20",
};

export default function OperationalRail() {
  const navigate = useNavigate();
  const { setActiveCameraId } = useSurveillanceStream();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [detections, setDetections] = useState<DetectionItem[]>([]);

  const [isLoadingAlerts, setIsLoadingAlerts] = useState<boolean>(true);
  const [evidenceModalData, setEvidenceModalData] = useState<EvidenceModalData | null>(null);
  const [telemetry, setTelemetry] = useState<SystemMetrics>({
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
  });
  const [filterSeverity, setFilterSeverity] = useState<"ALL" | "CRITICAL">("ALL");

  useEffect(() => {
    let isMounted = true;
    async function loadRailData() {
      try {
        const [alertsRes, detsRes, statsRes] = await Promise.allSettled([
          api.getAlerts(),
          api.getDetections(),
          api.getStatistics(),
        ]);
        if (!isMounted) return;

        if (alertsRes.status === "fulfilled" && alertsRes.value) {
          setAlerts(alertsRes.value);
        }
        if (detsRes.status === "fulfilled" && detsRes.value) {
          setDetections(detsRes.value);
        }
        if (statsRes.status === "fulfilled" && statsRes.value) {
          setTelemetry(statsRes.value);
        }
      } catch (e) {
        console.warn("Error loading operational rail data:", e);
      } finally {
        if (isMounted) setIsLoadingAlerts(false);
      }
    }
    loadRailData();
    const interval = setInterval(loadRailData, 5000);

    // Subscribe to live WebSocket alerts with deduplication & state merge
    const unsubAlerts = wsService.subscribeAlerts((incomingAlert) => {
      if (!isMounted) return;
      setAlerts((prev) => {
        const idx = prev.findIndex((a) => a.id === incomingAlert.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...incomingAlert };
          return next;
        }
        return [incomingAlert, ...prev];
      });
      // Synchronize active telemetry stats immediately
      api.getStatistics().then((stats) => {
        if (isMounted && stats) setTelemetry(stats);
      }).catch(() => {});
    });

    const unsubDets = wsService.subscribeDetections((incomingDet) => {
      if (!isMounted) return;
      setDetections((prev) => {
        if (prev.some((d) => d.id === incomingDet.id)) return prev;
        return [incomingDet, ...prev.slice(0, 49)];
      });
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubAlerts();
      unsubDets();
    };
  }, []);

  const handleAcknowledge = async (alertId: string) => {
    setAlerts((prev) =>
      prev.map((al) =>
        al.id === alertId ? { ...al, status: "investigating" as const } : al
      )
    );
    try {
      await api.acknowledgeEvent(alertId);
      const stats = await api.getStatistics();
      if (stats) setTelemetry(stats);
    } catch (e) {
      console.warn("Failed to acknowledge alert:", e);
    }
  };

  const handleResolve = async (alertId: string) => {
    setAlerts((prev) =>
      prev.map((al) =>
        al.id === alertId ? { ...al, status: "resolved" as const } : al
      )
    );
    try {
      await api.resolveEvent(alertId);
      const stats = await api.getStatistics();
      if (stats) setTelemetry(stats);
    } catch (e) {
      console.warn("Failed to resolve alert:", e);
    }
  };

  const displayedAlerts =
    filterSeverity === "CRITICAL"
      ? alerts.filter((a) => a.severity === "critical")
      : alerts;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* 1. System Telemetry Strip */}
      <div className="bg-gov-card rounded-xl border border-navy-200 p-4 shadow-gov">
        <div className="flex items-center justify-between border-b border-navy-100 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-cctv-pulse" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-navy-800">
              System Telemetry
            </h2>
          </div>
          <span className="text-[10px] font-semibold text-navy-500 bg-navy-100 px-2 py-0.5 rounded border border-navy-200">
            REALTIME
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-navy-50 border border-navy-200">
            <span className="text-[10px] text-navy-500 font-medium block mb-0.5">Active Cams</span>
            <span className="text-sm font-bold font-mono text-status-live">
              {telemetry.activeCameras}/{telemetry.totalCameras}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-navy-50 border border-navy-200">
            <span className="text-[10px] text-navy-500 font-medium block mb-0.5">Latency</span>
            <span className="text-sm font-bold font-mono text-navy-800">
              {telemetry.streamLatencyMs}ms
            </span>
          </div>
          <div className="p-2 rounded-lg bg-navy-50 border border-navy-200">
            <span className="text-[10px] text-navy-500 font-medium block mb-0.5">Offline</span>
            <span className="text-sm font-bold font-mono text-status-warn">
              {telemetry.offlineCameras}
            </span>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-navy-100">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-navy-500 font-medium">NET: <span className="font-mono text-navy-600">{telemetry.networkThroughputMbps} Mbps</span></span>
            <span className="font-semibold text-navy-600 uppercase">{telemetry.defconLevel}</span>
          </div>
        </div>
      </div>

      {/* 2. Security Alerts */}
      <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov flex flex-col">
        <div className="px-3.5 py-2.5 border-b border-navy-200 bg-navy-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-status-critical animate-cctv-pulse" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-navy-800">
              Security Alerts
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilterSeverity("ALL")}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                filterSeverity === "ALL"
                  ? "bg-navy-800 text-white"
                  : "text-navy-500 hover:bg-navy-200"
              }`}
            >
              All ({alerts.length})
            </button>
            <button
              onClick={() => setFilterSeverity("CRITICAL")}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                filterSeverity === "CRITICAL"
                  ? "bg-status-critical text-white"
                  : "text-navy-500 hover:bg-navy-200"
              }`}
            >
              CRIT ({alerts.filter((a) => a.severity === "critical").length})
            </button>
          </div>
        </div>

        <div className="divide-y divide-navy-100 max-h-[360px] overflow-y-auto">
          {isLoadingAlerts ? (
            <div className="p-6 text-center text-xs text-navy-400 font-mono flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-navy-600 animate-ping" />
              <span>Synchronizing active alerts...</span>
            </div>
          ) : displayedAlerts.length === 0 ? (
            <div className="p-4 text-center text-xs text-navy-400 font-mono">
              No active security alerts recorded.
            </div>
          ) : (
            displayedAlerts.map((alert) => {
              const isCrit = alert.severity === "critical";
              return (
                <div
                  key={alert.id}
                  onClick={() => {
                    if (alert.cameraId) {
                      setActiveCameraId(alert.cameraId);
                    }
                  }}
                  className={`p-3 space-y-1.5 transition-colors cursor-pointer ${
                    isCrit
                      ? "bg-status-criticalBg/15 hover:bg-status-criticalBg/30"
                      : "hover:bg-navy-50"
                  }`}
                  title={alert.cameraId ? `Focus Camera ${alert.cameraCode}` : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <StatusBadge
                        status={alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "warning" : "advisory"}
                      />
                      <span className="text-[11px] font-mono font-semibold text-navy-800">
                        {alert.cameraCode}
                      </span>
                      {alert.plateNumber && (
                        <span className="font-mono text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded shadow-2xs">
                          {alert.plateNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-navy-400 shrink-0">{alert.timestamp}</span>
                  </div>

                  <p className="text-[11px] font-semibold text-navy-800 leading-snug">{alert.title}</p>
                  <p className="text-[10px] text-navy-500 leading-normal">{alert.description}</p>

                  {/* Plate thumbnail if available */}
                  {alert.plateImageUrl && (
                    <div className="flex items-center gap-2 my-1 p-1 bg-navy-50 rounded border border-navy-200">
                      <img
                        src={alert.plateImageUrl}
                        alt={`Plate crop ${alert.plateNumber || ""}`}
                        className="h-6 w-auto max-w-[120px] object-contain rounded border border-navy-300 bg-black"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <span className="text-[9px] text-emerald-700 font-semibold">Plate Crop Saved</span>
                    </div>
                  )}

                  <div className="pt-0.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-navy-500 font-medium truncate">
                      {alert.assignedUnit || "Unassigned"}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(alert.plateImageUrl || alert.snapshotUrl || alert.plateNumber) && (
                        <button
                          type="button"
                          onClick={() =>
                            setEvidenceModalData({
                              eventId: alert.id,
                              plateNumber: alert.plateNumber,
                              cameraCode: alert.cameraCode,
                              sector: alert.sector,
                              timestamp: alert.timestamp,
                              plateImageUrl: alert.plateImageUrl,
                              snapshotUrl: alert.snapshotUrl,
                              captureStatus: alert.evidenceStatus || "SUCCESS",
                              details: alert.description,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-semibold transition-colors shadow-2xs cursor-pointer"
                        >
                          Evidence
                        </button>
                      )}
                      <button
                        onClick={() => navigate("/dashboard/analysis")}
                        className="px-2 py-0.5 rounded bg-navy-100 hover:bg-navy-200 text-navy-700 text-[10px] font-medium border border-navy-200 transition-colors cursor-pointer"
                      >
                        Analyse
                      </button>
                      {alert.status === "unresolved" ? (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="px-2 py-0.5 rounded bg-navy-800 hover:bg-navy-700 text-white text-[10px] font-medium transition-colors cursor-pointer"
                        >
                          ACK
                        </button>
                      ) : alert.status === "investigating" ? (
                        <button
                          onClick={() => handleResolve(alert.id)}
                          className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-medium transition-colors cursor-pointer"
                          title="Mark incident as resolved"
                        >
                          Resolve
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-600 font-medium font-mono">
                          Resolved
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. AI Detection Log */}
      <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov flex flex-col">
        <div className="px-3.5 py-2.5 border-b border-navy-200 bg-navy-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-status-info animate-cctv-pulse" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-navy-800">
              Live AI Detections
            </h2>
          </div>
          <span className="text-[10px] font-semibold text-navy-500 bg-navy-100 px-1.5 py-0.5 rounded border border-navy-200">
            REALTIME
          </span>
        </div>

        <div className="divide-y divide-navy-100 max-h-[240px] overflow-y-auto">
          {detections.length === 0 ? (
            <div className="p-4 text-center text-xs text-navy-400">
              No live computer vision detections.
            </div>
          ) : (
            detections.map((det) => (
              <div
                key={det.id}
                className="px-3 py-2 hover:bg-navy-50 transition-colors flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                        detectionTypeBadge[det.type] ?? "bg-navy-100 text-navy-600 border-navy-200"
                      }`}
                    >
                      {detectionTypeLabel[det.type] ?? det.type.toUpperCase()}
                    </span>
                    <span className="text-[11px] font-semibold text-navy-800 truncate">
                      {det.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-navy-500">
                    <span className="font-mono text-navy-600 font-medium">{det.cameraCode}</span>
                    <span className="text-navy-400"> · </span>
                    <span className="font-medium">{det.sector}</span>
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-[10px] font-mono font-bold text-navy-700">
                    {Math.round(det.confidence * 100)}%
                  </p>
                  <p className="text-[9px] font-mono text-navy-400">{det.timestamp}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Forensic Evidence Inspection Modal */}
      <EvidenceModal
        open={Boolean(evidenceModalData)}
        onClose={() => setEvidenceModalData(null)}
        data={evidenceModalData}
      />
    </div>
  );
}
