import { useEffect, useRef, useState } from "react";
import { IconMenu, IconShield } from "./Icons";
import { mockAlerts, mockOperator } from "../data/mockData";
import { AnimatePresence, motion } from "framer-motion";
import { useOfficerProfile } from "../context/OfficerProfileContext";
import { useWebSocketStatus } from "../services/websocket";

interface TopBarProps {
  title: string;
  subtitle?: string;
  onToggleSidebar?: () => void;
}

export default function TopBar({ title, subtitle, onToggleSidebar }: TopBarProps) {
  const { openProfile } = useOfficerProfile();
  const wsStatus = useWebSocketStatus();
  const [now, setNow] = useState(new Date());
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertDropRef = useRef<HTMLDivElement>(null);

  const initials = mockOperator.name
    .split(" ")
    .filter((w) => w.match(/^[A-Z]/))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close alert dropdown on outside click
  useEffect(() => {
    if (!alertsOpen) return;
    const handler = (e: MouseEvent) => {
      if (alertDropRef.current && !alertDropRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [alertsOpen]);

  const formattedDate = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const formattedTime = now.toLocaleTimeString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const unresolvedCritical = mockAlerts.filter(
    (a) => a.severity === "critical" && a.status !== "resolved"
  );

  return (
    <header className="h-14 shrink-0 bg-gov-card border-b border-navy-200 px-4 sm:px-5 flex items-center justify-between gap-3 z-20 shadow-gov">
      {/* Left: Mobile trigger & Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 rounded-lg text-navy-500 hover:text-navy-900 hover:bg-navy-100 transition-colors"
            aria-label="Toggle navigation menu"
          >
            <IconMenu size={18} />
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[13px] font-semibold text-navy-900 truncate tracking-tight leading-tight">
              {title}
            </h1>
            <span className="hidden sm:inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-navy-100 text-navy-700 border border-navy-200 leading-none shrink-0">
              IBVAP
            </span>
          </div>
          {subtitle && (
            <p className="text-[10px] text-navy-400 truncate hidden md:block mt-0.5 leading-tight">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Operational Status / Alerts / Clearance / Clock */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Operational Status / WebSocket Indicator */}
        <div
          title={
            wsStatus === "connected"
              ? "Live WebSocket connected — Real-time event stream active"
              : wsStatus === "connecting"
              ? "Connecting to live surveillance WebSocket..."
              : "WebSocket stream offline — Operating on cached telemetry"
          }
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold border transition-colors ${
            wsStatus === "connected"
              ? "bg-status-liveBg text-status-live border-status-live/30"
              : wsStatus === "connecting"
              ? "bg-status-warnBg text-status-warn border-status-warn/30"
              : "bg-navy-100 text-navy-500 border-navy-300"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsStatus === "connected"
                ? "bg-status-live animate-cctv-pulse"
                : wsStatus === "connecting"
                ? "bg-status-warn animate-pulse"
                : "bg-navy-400"
            }`}
          />
          <span className="text-[10px] uppercase tracking-wide font-mono">
            {wsStatus === "connected"
              ? "WS: LIVE STREAM"
              : wsStatus === "connecting"
              ? "WS: CONNECTING"
              : "WS: OFFLINE"}
          </span>
        </div>

        {/* Alert Bell with unresolved critical count */}
        <div ref={alertDropRef} className="relative">
          <button
            onClick={() => setAlertsOpen((p) => !p)}
            className={`relative flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
              unresolvedCritical.length > 0
                ? "bg-status-criticalBg border-status-critical/30 text-status-critical"
                : "bg-navy-50 border-navy-200 text-navy-500 hover:text-navy-800 hover:bg-navy-100"
            }`}
            aria-label={`${unresolvedCritical.length} unresolved critical alerts`}
            title="Active Alerts"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unresolvedCritical.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-status-critical text-white text-[9px] font-bold flex items-center justify-center font-mono">
                {unresolvedCritical.length}
              </span>
            )}
          </button>

          {/* Alert dropdown */}
          <AnimatePresence>
            {alertsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-72 bg-gov-card border border-navy-200 rounded-xl shadow-govLg overflow-hidden z-50"
              >
                <div className="px-3 py-2 border-b border-navy-100 flex items-center justify-between bg-navy-50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-navy-700">
                    Active Alerts
                  </span>
                  <span className="text-[10px] font-mono text-navy-400">
                    {mockAlerts.filter(a => a.status !== "resolved").length} unresolved
                  </span>
                </div>
                <div className="divide-y divide-navy-100 max-h-64 overflow-y-auto">
                  {mockAlerts.filter(a => a.status !== "resolved").map((alert) => (
                    <div key={alert.id} className={`px-3 py-2.5 ${alert.severity === "critical" ? "bg-status-criticalBg/20" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-navy-900 leading-tight truncate">{alert.title}</p>
                          <p className="text-[10px] text-navy-500 mt-0.5">{alert.cameraCode} · {alert.sector}</p>
                        </div>
                        <span className={`shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                          alert.severity === "critical"
                            ? "bg-status-critical text-white"
                            : "bg-status-warnBg text-status-warn border border-status-warn/30"
                        }`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-navy-400 mt-1">{alert.timestamp}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Canonical User Profile Trigger Button */}
        <button
          type="button"
          onClick={() => openProfile(mockOperator.name)}
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-navy-50 hover:bg-navy-100 border border-navy-200 text-navy-900 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-navy-400 group shrink-0"
          title={`Operator Profile: ${mockOperator.name} (${mockOperator.officerId})`}
          aria-label={`Open operator profile for ${mockOperator.name}`}
        >
          <div className="w-5 h-5 rounded-md bg-navy-800 border border-navy-700 flex items-center justify-center text-[9px] font-semibold text-white shrink-0 group-hover:bg-navy-900 transition-colors select-none">
            {initials}
          </div>
          <span className="text-xs font-semibold text-navy-900 group-hover:text-blue-700 transition-colors tracking-tight hidden sm:inline">
            {mockOperator.name}
          </span>
        </button>

        {/* Security Clearance Tag */}
        <div className="hidden xl:flex items-center gap-1.5 text-navy-600 bg-navy-50 border border-navy-200 px-2.5 py-1 rounded-lg">
          <IconShield size={11} className="text-navy-600" />
          <span className="text-[10px] font-semibold font-mono">{mockOperator.clearanceLevel}</span>
        </div>

        {/* Real-time IST Clock */}
        <div className="flex items-center gap-1.5 font-mono bg-navy-50 border border-navy-200 px-2.5 py-1 rounded-lg">
          <span className="text-[10px] text-navy-400 hidden sm:inline">{formattedDate}</span>
          <span className="text-[10px] text-navy-300 hidden sm:inline">|</span>
          <span className="text-[11px] font-bold text-navy-800">{formattedTime} IST</span>
        </div>
      </div>
    </header>
  );
}
