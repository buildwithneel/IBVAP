import Layout from "../components/Layout";
import { mockOperator } from "../data/mockData";
import { IconCheckCircle, IconShield } from "../components/Icons";

const initials = mockOperator.name
  .split(" ")
  .filter((w) => w.match(/^[A-Z]/))
  .slice(0, 2)
  .map((w) => w[0])
  .join("");

const permissions = [
  { label: "Live Optical CCTV Feed Monitoring (All Sectors)", status: "Granted" },
  { label: "Thermal IR Sensor Toggle & Optical Zoom", status: "Granted" },
  { label: "Tripwire Breach Alarm Dispatch & Acknowledgement", status: "Granted" },
  { label: "Incident Dossier Generation & Archival Export", status: "Granted" },
  { label: "Camera Hardware Calibration & RTSP Reset", status: "Requires Supervisor" },
  { label: "Audit Log Deletion / Modification", status: "Restricted (Level-4 Only)" },
];

const sessionLog = [
  { time: "07:12:03", action: "Terminal Authentication", status: "OK" },
  { time: "07:12:15", action: "RTSP Stream Handshake — All Sectors", status: "OK" },
  { time: "07:15:48", action: "Tripwire Calibration — Sector 3", status: "OK" },
  { time: "08:22:11", action: "Acknowledged Alert: ALT-2024-4221", status: "ACK" },
  { time: "09:04:37", action: "Incident Dossier Generated: RPT-2024-0004", status: "OK" },
  { time: "09:45:00", action: "Sector 1 Camera Offline — Auto-Diagnostic Triggered", status: "WARN" },
];

export default function UserDetails() {
  return (
    <Layout
      title="Operator Security Dossier & Terminal Profile"
      subtitle="Officer Verification, Role Permissions & Cryptographic Terminal Access Audit"
    >
      <div className="max-w-4xl mx-auto space-y-5 animate-page-enter">
        {/* Main Officer ID Card */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-6 shadow-gov overflow-hidden relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-navy-200 pb-6">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-xl bg-navy-900 border-2 border-navy-700 flex items-center justify-center text-white text-2xl font-bold font-mono shrink-0 shadow-lg select-none">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-navy-900">{mockOperator.name}</h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-status-liveBg text-status-live border border-status-live/30">
                    <IconCheckCircle size={11} />
                    VERIFIED ACTIVE
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-navy-600 mt-0.5">{mockOperator.designation}</p>
                <p className="text-[11px] text-navy-400 font-mono mt-0.5">
                  SERVICE NO: {mockOperator.officerId}
                </p>
              </div>
            </div>

            <div className="sm:text-right space-y-1">
              <span className="text-[10px] font-mono text-navy-400 block uppercase tracking-wide">Station Allocation</span>
              <span className="text-xs font-semibold text-navy-900 block">{mockOperator.deploymentStation}</span>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <IconShield size={12} className="text-navy-600" />
                <span className="text-[11px] font-semibold text-navy-700">{mockOperator.clearanceLevel}</span>
              </div>
            </div>
          </div>

          {/* Attribute Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-5 text-xs">
            {[
              { label: "Force Unit / Division",      value: mockOperator.forceUnit },
              { label: "Security Clearance",          value: mockOperator.clearanceLevel },
              { label: "Active Session IP",           value: mockOperator.activeSessionIp, mono: true },
              { label: "Shift Duty Commenced",        value: mockOperator.loginTime, mono: true },
              { label: "Last Security Audit",         value: mockOperator.lastAuditDate, mono: true },
              { label: "Intercom Extension",          value: mockOperator.contactExtension, mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label} className="bg-navy-50 p-3 rounded-lg border border-navy-200/80">
                <span className="text-navy-400 block text-[10px] uppercase font-semibold tracking-wide mb-0.5">
                  {label}
                </span>
                <span className={`font-semibold text-navy-900 ${mono ? "font-mono text-[11px]" : ""}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Access Permissions Matrix */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-5 shadow-gov space-y-3">
          <div className="flex items-center justify-between border-b border-navy-100 pb-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-navy-700">
              Assigned Terminal Capabilities
            </h3>
            <span className="text-[10px] font-mono text-navy-400 bg-navy-100 px-2 py-0.5 rounded border border-navy-200">
              {permissions.filter(p => p.status === "Granted").length} of {permissions.length} Granted
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {permissions.map((perm, idx) => {
              const isGranted = perm.status === "Granted";
              const isSupervisor = perm.status.startsWith("Requires");
              return (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-navy-50 border border-navy-200/70 flex items-start justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-0.5 ${
                      isGranted ? "bg-status-live" : isSupervisor ? "bg-status-warn" : "bg-status-critical"
                    }`} />
                    <span className="text-navy-700 text-[11px] leading-snug">{perm.label}</span>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                      isGranted
                        ? "bg-status-liveBg text-status-live border border-status-live/20"
                        : isSupervisor
                        ? "bg-status-warnBg text-status-warn border border-status-warn/20"
                        : "bg-status-criticalBg text-status-critical border border-status-critical/20"
                    }`}
                  >
                    {isGranted ? "GRANTED" : isSupervisor ? "RESTRICTED" : "DENIED"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Session Activity Log */}
        <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
          <div className="px-4 py-3 border-b border-navy-200 bg-navy-50 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-navy-700">
              Current Session Activity Log
            </h3>
            <span className="text-[10px] font-mono text-navy-400 bg-navy-100 px-2 py-0.5 rounded border border-navy-200">
              Duty: {mockOperator.loginTime}
            </span>
          </div>

          <div className="divide-y divide-navy-100">
            {sessionLog.map((entry, idx) => (
              <div key={idx} className="px-4 py-2 flex items-center justify-between gap-3 text-xs hover:bg-navy-50/70 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-navy-400 text-[10px] shrink-0">{entry.time}</span>
                  <span className="text-navy-700">{entry.action}</span>
                </div>
                <span className={`shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  entry.status === "OK"
                    ? "bg-status-liveBg text-status-live"
                    : entry.status === "ACK"
                    ? "bg-status-infoBg text-status-info"
                    : "bg-status-warnBg text-status-warn"
                }`}>
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
