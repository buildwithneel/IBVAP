import { SystemMetrics } from "../types";
import { IconAlertTriangle, IconCamera, IconUser } from "./Icons";

function IconCar({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 11.2 2 11.6 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </svg>
  );
}

interface StatsStripProps {
  metrics: SystemMetrics;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  secondary?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: "default" | "critical";
  className?: string;
  staggerIdx?: number;
}

function MetricCard({
  label,
  value,
  secondary,
  icon,
  badge,
  variant = "default",
  className = "",
  staggerIdx = 0,
}: MetricCardProps) {
  const staggerClass = `stagger-${Math.min(staggerIdx + 1, 5)}`;

  if (variant === "critical") {
    return (
      <div className={`bg-status-criticalBg rounded-xl border-2 border-status-critical/25 p-3.5 flex flex-col justify-between shadow-gov animate-card-enter ${staggerClass} ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-status-critical uppercase tracking-wider flex items-center gap-1.5">
            {icon}
            {label}
          </span>
          <span className="w-2 h-2 rounded-full bg-status-critical animate-cctv-pulse" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono text-status-critical tracking-tight">
            {typeof value === "number" ? value.toString().padStart(2, "0") : value}
          </span>
          {secondary && (
            <span className="text-[11px] text-status-critical/70 font-medium cursor-pointer hover:text-status-critical transition-colors">
              {secondary}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gov-card rounded-xl border border-navy-200 p-3.5 flex flex-col justify-between shadow-gov animate-card-enter ${staggerClass} ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-navy-500 uppercase tracking-wider">{label}</span>
        {badge ?? (icon && <div className="p-1 rounded bg-navy-100 text-navy-600">{icon}</div>)}
      </div>
      <div className="mt-2.5 flex items-baseline justify-between">
        <span className="text-2xl font-bold font-mono text-navy-900 tracking-tight">
          {typeof value === "number" ? value.toString().padStart(2, "0") : value}
        </span>
        {secondary && (
          <span className="text-[11px] text-navy-400 font-medium">{secondary}</span>
        )}
      </div>
    </div>
  );
}

import React from "react";

export default function StatsStrip({ metrics }: StatsStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <MetricCard
        staggerIdx={0}
        label="Total Cameras"
        value={metrics.totalCameras}
        secondary="Installed Units"
        icon={<IconCamera size={14} />}
      />

      <MetricCard
        staggerIdx={1}
        label="Active Cameras"
        value={metrics.activeCameras}
        secondary={`${metrics.offlineCameras} Offline`}
        badge={
          <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-status-liveBg text-status-live text-[10px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-cctv-pulse" />
            <span>ONLINE</span>
          </div>
        }
      />

      <MetricCard
        staggerIdx={2}
        label="Persons Detected"
        value={metrics.personsDetected}
        secondary="In Perimeter"
        icon={<IconUser size={14} />}
      />

      <MetricCard
        staggerIdx={3}
        label="Vehicles Detected"
        value={metrics.vehiclesDetected}
        secondary="Active Transit"
        icon={<IconCar size={14} />}
      />

      <MetricCard
        staggerIdx={4}
        variant="critical"
        label="Critical Alerts"
        value={metrics.criticalAlerts}
        secondary="Review Priority →"
        icon={<IconAlertTriangle size={13} />}
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}
