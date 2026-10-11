import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { IntelligenceItem } from "../types";
import { IconIntelligence } from "../components/Icons";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { api } from "../services/api";

const priorityConfig: Record<string, { bar: string; badge: string; label: string }> = {
  HIGH: {
    bar: "border-l-status-critical",
    badge: "bg-status-criticalBg text-status-critical border-status-critical/30",
    label: "HIGH PRIORITY",
  },
  MEDIUM: {
    bar: "border-l-status-warn",
    badge: "bg-status-warnBg text-status-warn border-status-warn/30",
    label: "MEDIUM PRIORITY",
  },
  ROUTINE: {
    bar: "border-l-navy-300",
    badge: "bg-navy-100 text-navy-600 border-navy-200",
    label: "ROUTINE",
  },
};

export default function Intelligence() {
  const navigate = useNavigate();
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [intelList, setIntelList] = useState<IntelligenceItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadIntelligence() {
      try {
        const alerts = await api.getAlerts();
        if (!isMounted) return;
        if (alerts && alerts.length > 0) {
          setIntelList(
            alerts.map((a) => ({
              id: a.id,
              referenceCode: `INTEL-${a.id.slice(-6).toUpperCase()}`,
              title: a.title,
              sector: a.sector,
              observedPattern: a.description,
              priority: a.severity === "critical" ? "HIGH" : a.severity === "warning" ? "MEDIUM" : "ROUTINE",
              dateReported: a.timestamp,
              status: "Active Monitoring",
              threatLevel: a.severity === "critical" ? "High Security Alert" : "Routine Observation",
              notes: `Camera ${a.cameraCode} event trigger.`,
            }))
          );
        }
      } catch (e) {
        console.warn("Failed to load intelligence records:", e);
      }
    }
    loadIntelligence();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredIntel =
    priorityFilter === "ALL"
      ? intelList
      : intelList.filter((i) => i.priority === priorityFilter);

  const counts = {
    ALL: intelList.length,
    HIGH: intelList.filter((i) => i.priority === "HIGH").length,
    MEDIUM: intelList.filter((i) => i.priority === "MEDIUM").length,
    ROUTINE: intelList.filter((i) => i.priority === "ROUTINE").length,
  };

  return (
    <Layout
      title="Tactical Intelligence & Border Anomaly Logs"
      subtitle="Behavioral Reconnaissance Patterns, Anomaly Corroborations & Threat Profiling"
    >
      <div className="space-y-4">
        {/* Header Card */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-4 shadow-gov flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-navy-100 text-navy-800 shrink-0">
              <IconIntelligence size={16} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-navy-900">
                Joint Intelligence Coordination Desk
              </p>
              <p className="text-[10px] text-navy-500 mt-0.5">
                Real-time correlation of automated computer vision events and watchlist patterns
              </p>
            </div>
          </div>

          {/* Priority Filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-navy-600 mr-1">Priority:</span>
            {(["ALL", "HIGH", "MEDIUM", "ROUTINE"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  priorityFilter === p
                    ? "bg-navy-900 text-white"
                    : "bg-navy-100 text-navy-600 hover:bg-navy-200"
                }`}
              >
                {p} ({counts[p as keyof typeof counts]})
              </button>
            ))}
          </div>
        </div>

        {/* Intelligence Cards */}
        {filteredIntel.length === 0 ? (
          <div className="bg-gov-card rounded-xl border border-navy-200 p-8 text-center shadow-gov">
            <EmptyState
              title="No intelligence logs recorded"
              description="There are currently zero tactical intelligence patterns or watchlist matches logged."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredIntel.map((item) => {
              const cfg = priorityConfig[item.priority] ?? priorityConfig.ROUTINE;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border border-l-4 p-4 shadow-gov bg-gov-card transition-all animate-card-enter ${cfg.bar} ${
                    item.priority === "HIGH" ? "border-t border-r border-b border-status-critical/20" : "border-t border-r border-b border-navy-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-navy-100 pb-2.5 mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-navy-600">
                        {item.referenceCode}
                      </span>
                      <span className="text-navy-300">·</span>
                      <span className="text-[11px] text-navy-500">{item.sector}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-navy-400">
                        LOGGED: {item.dateReported}
                      </span>
                      <StatusBadge status="Active Monitoring" />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <h3 className="text-sm font-bold text-navy-900 leading-snug">{item.title}</h3>

                    <div className="bg-navy-50 p-3 rounded-lg border border-navy-200/60 space-y-0.5">
                      <span className="text-[10px] font-bold text-navy-500 uppercase tracking-wide block">
                        Observed Pattern &amp; Telemetry
                      </span>
                      <p className="text-xs text-navy-700 leading-relaxed">{item.observedPattern}</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-navy-500 font-semibold uppercase tracking-wide">
                          Tactical Assessment:
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            item.priority === "HIGH"
                              ? "text-status-critical"
                              : item.priority === "MEDIUM"
                              ? "text-status-warn"
                              : "text-navy-600"
                          }`}
                        >
                          {item.threatLevel}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => navigate("/dashboard/feed")}
                          className="px-2.5 py-1 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-700 text-[10px] font-medium border border-navy-200 transition-colors"
                        >
                          View CV Feed
                        </button>
                        {item.priority !== "ROUTINE" && (
                          <button
                            onClick={() => navigate("/dashboard/reports")}
                            className="px-2.5 py-1 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-medium transition-colors"
                          >
                            File Incident Dossier
                          </button>
                        )}
                      </div>
                    </div>

                    {item.notes && (
                      <p className="text-[10px] text-navy-400 italic border-t border-navy-100 pt-2">
                        Note: {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
