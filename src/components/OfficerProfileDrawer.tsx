import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOfficerProfile } from "../context/OfficerProfileContext";
import { IconCheckCircle, IconShield } from "./Icons";

export default function OfficerProfileDrawer() {
  const { isOpen, activeOfficer, closeProfile } = useOfficerProfile();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeProfile();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeProfile]);

  // Focus management
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [isOpen]);

  if (!activeOfficer) return null;

  const initials = activeOfficer.name
    .split(" ")
    .filter((w) => w.match(/^[A-Z]/i))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "DO";

  const permissions = activeOfficer.permissions || [
    { label: "Live Optical CCTV Feed Monitoring (All Sectors)", status: "Granted" as const },
    { label: "Thermal IR Sensor Toggle & Optical Zoom", status: "Granted" as const },
    { label: "Tripwire Breach Alarm Dispatch & Acknowledgement", status: "Granted" as const },
    { label: "Incident Dossier Generation & Archival Export", status: "Granted" as const },
    { label: "Camera Hardware Calibration & RTSP Reset", status: "Requires Supervisor" as const },
    { label: "Audit Log Deletion / Modification", status: "Restricted" as const },
  ];

  const sessionLog = activeOfficer.sessionLog || [
    { time: new Date().toLocaleTimeString("en-IN"), action: "Terminal Authentication", status: "OK" as const },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 overflow-hidden flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`Officer Security Dossier: ${activeOfficer.name}`}
        >
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-navy-950/70 backdrop-blur-[2px]"
            onClick={closeProfile}
            aria-hidden="true"
          />

          {/* Slide-Over Drawer Container */}
          <motion.aside
            key="drawer-panel"
            ref={drawerRef}
            tabIndex={-1}
            initial={{ x: "100%", opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-lg bg-gov-card border-l border-navy-200 shadow-2xl flex flex-col h-full overflow-hidden outline-none"
          >
            {/* Drawer Header */}
            <div className="px-5 py-3.5 border-b border-navy-200 bg-navy-50/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-status-live animate-cctv-pulse shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-[12px] font-semibold uppercase tracking-wider text-navy-900 leading-tight">
                    Officer Security Dossier
                  </h2>
                  <p className="text-[10px] text-navy-500 font-mono">
                    Terminal Profile &amp; Role Clearance
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={closeProfile}
                  className="p-1.5 rounded-lg text-navy-500 hover:text-navy-900 hover:bg-navy-200 transition-colors focus:outline-none focus:ring-2 focus:ring-navy-400"
                  aria-label="Close officer profile drawer"
                  title="Close (Esc)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Drawer Body — Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-navy-900">
              {/* Primary Identity Card */}
              <div className="p-4 rounded-xl bg-navy-900 text-white shadow-gov space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-navy-800 border-2 border-navy-700 flex items-center justify-center text-white text-lg font-semibold shrink-0 shadow-inner select-none">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-white tracking-tight">{activeOfficer.name}</h3>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                          <IconCheckCircle size={10} />
                          {activeOfficer.status?.toUpperCase() || "ACTIVE"}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-navy-200 mt-0.5">
                        {activeOfficer.role || activeOfficer.designation}
                      </p>
                      <p className="text-[10px] text-navy-400 font-mono mt-0.5">
                        SERVICE ID: {activeOfficer.officerId}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[9px] font-mono text-navy-400 block uppercase">Clearance</span>
                    <div className="inline-flex items-center gap-1 mt-0.5 text-navy-200 text-[10px] font-semibold bg-navy-800 px-2 py-0.5 rounded border border-navy-700">
                      <IconShield size={11} className="text-blue-400" />
                      <span>{activeOfficer.clearanceLevel.split("(")[0].trim()}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-navy-800/80 flex items-center justify-between text-[10px] text-navy-300">
                  <span>{activeOfficer.organization || "Sashastra Seema Bal (SSB)"}</span>
                  <span className="font-mono text-navy-400">{activeOfficer.forceUnit}</span>
                </div>
              </div>

              {/* Core Officer Specification Grid */}
              <div className="bg-navy-50 rounded-xl border border-navy-200 p-3.5 space-y-2.5">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-navy-700 border-b border-navy-200 pb-1.5">
                  Officer Operational Dossier
                </h4>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gov-card p-2 rounded-lg border border-navy-200/80">
                    <span className="text-navy-400 block text-[9px] uppercase font-semibold">Name</span>
                    <span className="font-semibold text-navy-900 text-[11px]">{activeOfficer.name}</span>
                  </div>

                  <div className="bg-gov-card p-2 rounded-lg border border-navy-200/80">
                    <span className="text-navy-400 block text-[9px] uppercase font-semibold">Role</span>
                    <span className="font-semibold text-navy-900 text-[11px]">{activeOfficer.role || activeOfficer.designation}</span>
                  </div>

                  <div className="bg-gov-card p-2 rounded-lg border border-navy-200/80">
                    <span className="text-navy-400 block text-[9px] uppercase font-semibold">Organization</span>
                    <span className="font-semibold text-navy-900 text-[11px]">{activeOfficer.organization || "Sashastra Seema Bal (SSB)"}</span>
                  </div>

                  <div className="bg-gov-card p-2 rounded-lg border border-navy-200/80">
                    <span className="text-navy-400 block text-[9px] uppercase font-semibold">Officer ID</span>
                    <span className="font-mono font-bold text-navy-900 text-[11px]">{activeOfficer.officerId}</span>
                  </div>

                  <div className="bg-gov-card p-2 rounded-lg border border-navy-200/80">
                    <span className="text-navy-400 block text-[9px] uppercase font-semibold">Access Level</span>
                    <span className="font-semibold text-navy-900 text-[11px] flex items-center gap-1">
                      <IconShield size={11} className="text-navy-600" />
                      {activeOfficer.clearanceLevel}
                    </span>
                  </div>

                  <div className="bg-gov-card p-2 rounded-lg border border-navy-200/80">
                    <span className="text-navy-400 block text-[9px] uppercase font-semibold">Current Status</span>
                    <span className="font-semibold text-emerald-700 text-[11px] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-cctv-pulse" />
                      {activeOfficer.status || "Active"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Capabilities Matrix */}
              <div className="bg-gov-card rounded-xl border border-navy-200 p-4 shadow-gov space-y-2.5">
                <div className="flex items-center justify-between border-b border-navy-100 pb-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-navy-800">
                    Terminal Capabilities &amp; Permissions
                  </h4>
                  <span className="text-[9px] font-semibold text-navy-600 bg-navy-100 px-1.5 py-0.5 rounded border border-navy-200">
                    {permissions.filter((p) => p.status === "Granted").length} Granted
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  {permissions.map((perm, idx) => {
                    const isGranted = perm.status === "Granted";
                    const isSupervisor = perm.status === "Requires Supervisor";
                    return (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-navy-50 border border-navy-200/60 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                              isGranted ? "bg-status-live" : isSupervisor ? "bg-status-warn" : "bg-status-critical"
                            }`}
                          />
                          <span className="text-navy-800 text-[11px] truncate">{perm.label}</span>
                        </div>
                        <span
                          className={`shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                            isGranted
                              ? "bg-status-liveBg text-status-live border border-status-live/20"
                              : isSupervisor
                              ? "bg-status-warnBg text-status-warn border border-status-warn/20"
                              : "bg-status-criticalBg text-status-critical border border-status-critical/20"
                          }`}
                        >
                          {perm.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Session Activity Log */}
              <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
                <div className="px-3.5 py-2 border-b border-navy-200 bg-navy-50 flex items-center justify-between">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-navy-800">
                    Shift Activity Log
                  </h4>
                  <span className="text-[9px] font-mono text-navy-500">
                    IP: {activeOfficer.activeSessionIp}
                  </span>
                </div>

                <div className="divide-y divide-navy-100 max-h-44 overflow-y-auto">
                  {sessionLog.map((entry, idx) => (
                    <div key={idx} className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs hover:bg-navy-50/70 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono text-navy-400 text-[10px] shrink-0">{entry.time}</span>
                        <span className="text-navy-800 text-[11px] truncate">{entry.action}</span>
                      </div>
                      <span
                        className={`shrink-0 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          entry.status === "OK"
                            ? "bg-status-liveBg text-status-live"
                            : entry.status === "ACK"
                            ? "bg-status-infoBg text-status-info"
                            : "bg-status-warnBg text-status-warn"
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-5 py-3 border-t border-navy-200 bg-navy-50/90 flex items-center justify-between gap-3 shrink-0">
              <span className="text-[10px] text-navy-400 font-mono">
                Press <kbd className="px-1.5 py-0.5 rounded bg-navy-200 text-navy-700 font-bold text-[9px]">ESC</kbd> to close
              </span>
              <button
                type="button"
                onClick={closeProfile}
                className="px-4 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-navy-400"
              >
                Close Dossier
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
