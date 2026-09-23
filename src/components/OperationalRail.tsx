import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mockAlerts, mockDetections, mockSystemMetrics } from "../data/mockData";
import { SecurityAlert } from "../types";
import StatusBadge from "./StatusBadge";

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
  const [alerts, setAlerts] = useState<SecurityAlert[]>(mockAlerts);
  const [filterSeverity, setFilterSeverity] = useState<"ALL" | "CRITICAL">("ALL");

  const handleAcknowledge = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((al) =>
        al.id === alertId ? { ...al, status: "investigating" as const } : al
      )
    );
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
          <span className="text-[10px] font-mono text-navy-400 bg-navy-100 px-2 py-0.5 rounded border border-navy-200">
            LIVE
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-navy-50 border border-navy-200">
            <span className="text-[10px] text-navy-500 font-medium block mb-0.5">Active</span>
            <span className="text-sm font-bold font-mono text-status-live">
              {mockSystemMetrics.activeCameras}/{mockSystemMetrics.totalCameras}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-navy-50 border border-navy-200">
            <span className="text-[10px] text-navy-500 font-medium block mb-0.5">Latency</span>
            <span className="text-sm font-bold font-mono text-navy-800">
              {mockSystemMetrics.streamLatencyMs}ms
            </span>
          </div>
          <div className="p-2 rounded-lg bg-navy-50 border border-navy-200">
            <span className="text-[10px] text-navy-500 font-medium block mb-0.5">Offline</span>
            <span className="text-sm font-bold font-mono text-status-warn">
              {mockSystemMetrics.offlineCameras}
            </span>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-navy-100">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-navy-400 font-mono">NET: {mockSystemMetrics.networkThroughputMbps} Mbps</span>
            <span className="font-medium text-navy-600 font-mono uppercase">{mockSystemMetrics.defconLevel}</span>
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

        <div className="divide-y divide-navy-100 max-h-[280px] overflow-y-auto">
          {displayedAlerts.map((alert) => {
            const isCrit = alert.severity === "critical";
            return (
              <div
                key={alert.id}
                className={`p-3 space-y-1.5 transition-colors ${
                  isCrit
                    ? "bg-status-criticalBg/15 hover:bg-status-criticalBg/30"
                    : "hover:bg-navy-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <StatusBadge
                      status={alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "warning" : "advisory"}
                    />
                    <span className="text-[11px] font-mono font-semibold text-navy-800">
                      {alert.cameraCode}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-navy-400 shrink-0">{alert.timestamp}</span>
                </div>

                <p className="text-[11px] font-semibold text-navy-800 leading-snug">{alert.title}</p>
                <p className="text-[10px] text-navy-500 leading-normal">{alert.description}</p>

                <div className="pt-0.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-navy-400 font-mono truncate">
                    {alert.assignedUnit || "Unassigned"}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => navigate("/dashboard/analysis")}
                      className="px-2 py-0.5 rounded bg-navy-100 hover:bg-navy-200 text-navy-700 text-[10px] font-medium border border-navy-200 transition-colors"
                    >
                      Analyse
                    </button>
                    {alert.status === "unresolved" ? (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="px-2 py-0.5 rounded bg-navy-800 hover:bg-navy-700 text-white text-[10px] font-medium transition-colors"
                      >
                        ACK
                      </button>
                    ) : (
                      <span className="text-[10px] text-status-info font-medium">
                        Investigating
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
          <span className="text-[10px] font-mono text-navy-400 bg-navy-100 px-1.5 py-0.5 rounded border border-navy-200">
            CV v3.1.4
          </span>
        </div>

        <div className="divide-y divide-navy-100 max-h-[240px] overflow-y-auto">
          {mockDetections.map((det) => (
            <div
              key={det.id}
              className="px-3 py-2 hover:bg-navy-50 transition-colors flex items-start justify-between gap-3"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                      detectionTypeBadge[det.type] ?? "bg-navy-100 text-navy-600 border-navy-200"
                    }`}
                  >
                    {detectionTypeLabel[det.type] ?? det.type.toUpperCase()}
                  </span>
                  <span className="text-[11px] font-semibold text-navy-800 truncate">
                    {det.label}
                  </span>
                </div>
                <p className="text-[10px] text-navy-400 font-mono">
                  {det.cameraCode} · {det.sector}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="text-[10px] font-mono font-bold text-navy-700">
                  {Math.round(det.confidence * 100)}%
                </p>
                <p className="text-[9px] font-mono text-navy-400">{det.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
