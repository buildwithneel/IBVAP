

type StatusVariant =
  | "ACTIVE"
  | "ALERT"
  | "OFFLINE"
  | "MAINTENANCE"
  | "critical"
  | "warning"
  | "advisory"
  | "Restricted"
  | "Confidential"
  | "Secret"
  | "Filed"
  | "Under Review"
  | "Closed"
  | "Active Monitoring"
  | "Verified"
  | "Archived"
  | "live"
  | "normal"
  | "info";

const variantMap: Record<
  StatusVariant,
  { bg: string; text: string; border: string; dot?: string; dotAnimate?: boolean; label?: string }
> = {
  ACTIVE: {
    bg: "bg-status-liveBg",
    text: "text-status-live",
    border: "border-status-live/30",
    dot: "bg-status-live",
    dotAnimate: true,
  },
  ALERT: {
    bg: "bg-status-criticalBg",
    text: "text-status-critical",
    border: "border-status-critical/30",
    dot: "bg-status-critical",
    dotAnimate: true,
  },
  OFFLINE: {
    bg: "bg-navy-100",
    text: "text-navy-500",
    border: "border-navy-300",
    dot: "bg-navy-400",
  },
  MAINTENANCE: {
    bg: "bg-status-warnBg",
    text: "text-status-warn",
    border: "border-status-warn/30",
    dot: "bg-status-warn",
  },
  critical: {
    bg: "bg-status-criticalBg",
    text: "text-status-critical",
    border: "border-status-critical/30",
  },
  warning: {
    bg: "bg-status-warnBg",
    text: "text-status-warn",
    border: "border-status-warn/30",
  },
  advisory: {
    bg: "bg-status-infoBg",
    text: "text-status-info",
    border: "border-status-info/30",
    label: "ADVISORY",
  },
  Restricted: {
    bg: "bg-navy-100",
    text: "text-navy-700",
    border: "border-navy-300",
  },
  Confidential: {
    bg: "bg-status-warnBg",
    text: "text-status-warn",
    border: "border-status-warn/30",
  },
  Secret: {
    bg: "bg-status-criticalBg",
    text: "text-status-critical",
    border: "border-status-critical/30",
  },
  Filed: {
    bg: "bg-navy-100",
    text: "text-navy-700",
    border: "border-navy-200",
  },
  "Under Review": {
    bg: "bg-status-warnBg",
    text: "text-status-warn",
    border: "border-status-warn/20",
  },
  Closed: {
    bg: "bg-status-liveBg",
    text: "text-status-live",
    border: "border-status-live/20",
  },
  "Active Monitoring": {
    bg: "bg-status-criticalBg",
    text: "text-status-critical",
    border: "border-status-critical/30",
    dot: "bg-status-critical",
    dotAnimate: true,
  },
  Verified: {
    bg: "bg-status-liveBg",
    text: "text-status-live",
    border: "border-status-live/20",
  },
  Archived: {
    bg: "bg-navy-100",
    text: "text-navy-500",
    border: "border-navy-200",
  },
  live: {
    bg: "bg-status-liveBg",
    text: "text-status-live",
    border: "border-status-live/20",
    dot: "bg-status-live",
    dotAnimate: true,
  },
  normal: {
    bg: "bg-navy-100",
    text: "text-navy-600",
    border: "border-navy-200",
  },
  info: {
    bg: "bg-status-infoBg",
    text: "text-status-info",
    border: "border-status-info/20",
  },
};

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export default function StatusBadge({
  status,
  label,
  size = "sm",
  className = "",
}: StatusBadgeProps) {
  const cfg = variantMap[status] ?? variantMap["normal"];
  const displayLabel = label ?? cfg.label ?? status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-bold uppercase border rounded
        ${size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"}
        ${cfg.bg} ${cfg.text} ${cfg.border} ${className}`}
    >
      {cfg.dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${
            cfg.dotAnimate ? "animate-cctv-pulse" : ""
          }`}
        />
      )}
      {displayLabel}
    </span>
  );
}
