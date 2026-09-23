import React from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export default function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-navy-100 border border-navy-200 flex items-center justify-center text-navy-400 mb-3">
          {icon}
        </div>
      )}
      <p className="text-xs font-semibold text-navy-700 uppercase tracking-wide">{title}</p>
      {description && (
        <p className="text-[11px] text-navy-400 mt-1 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
