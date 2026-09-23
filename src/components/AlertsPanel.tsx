import { SecurityAlert } from "../types";

const severityStyles: Record<SecurityAlert["severity"], string> = {
  critical: "bg-status-criticalBg text-status-critical border-status-critical/30",
  warning: "bg-status-warnBg text-status-warn border-status-warn/30",
  advisory: "bg-navy-100 text-navy-700 border-navy-200",
};

export default function AlertsPanel({ alerts }: { alerts: SecurityAlert[] }) {
  return (
    <div className="rounded-xl bg-gov-card border border-navy-200 flex flex-col overflow-hidden shadow-gov">
      <div className="px-4 py-3 border-b border-navy-200 bg-navy-50 flex items-center justify-between">
        <h3 className="font-bold text-navy-900 text-xs uppercase tracking-wider">Camera Alerts</h3>
        <span className="w-2 h-2 rounded-full bg-status-critical animate-cctv-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-navy-100">
        {alerts.map((alert) => (
          <div key={alert.id} className="px-4 py-3 flex flex-col gap-1 hover:bg-navy-50">
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                  severityStyles[alert.severity]
                }`}
              >
                {alert.severity.toUpperCase()}
              </span>
              <span className="text-[10px] font-mono text-navy-500">{alert.timestamp}</span>
            </div>
            <p className="text-xs font-semibold text-navy-900">{alert.title}</p>
            <p className="text-[11px] text-navy-500">{alert.cameraCode} — {alert.sector}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
