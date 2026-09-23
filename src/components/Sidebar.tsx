import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconAnalysis,
  IconCamera,
  IconDashboard,
  IconFleet,
  IconIntelligence,
  IconLogout,
  IconReports,
} from "./Icons";
import { IBVAPLogo } from "./EmblemMark";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const navItems = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: IconDashboard,
    end: true,
    desc: "Command overview",
  },
  {
    label: "Camera Feed",
    to: "/dashboard/feed",
    icon: IconCamera,
    end: false,
    desc: "Live multi-cam tactical",
  },
  {
    label: "Surveillance Analysis",
    to: "/dashboard/analysis",
    icon: IconAnalysis,
    end: false,
    desc: "AI detection engine",
  },
  {
    label: "Cameras",
    to: "/dashboard/cameras",
    icon: IconFleet,
    end: false,
    desc: "Fleet management",
  },
  {
    label: "Reports",
    to: "/dashboard/reports",
    icon: IconReports,
    end: false,
    desc: "Incident dossiers",
  },
  {
    label: "Intelligence",
    to: "/dashboard/intelligence",
    icon: IconIntelligence,
    end: false,
    desc: "Anomaly patterns",
  },
];

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/");
  };

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-navy-950/70 z-40 lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-[220px] bg-navy-900 border-r border-navy-800/80 text-navy-100 flex flex-col transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Operations Navigation"
      >
        {/* Top Branding */}
        <div className="px-4 py-3 border-b border-navy-800/70 flex items-center justify-between shrink-0">
          <NavLink
            to="/dashboard"
            className="flex items-center hover:opacity-90 transition-opacity"
            title="IBVAP Command Dashboard"
          >
            <IBVAPLogo size="md" />
          </NavLink>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-navy-800 transition-colors"
              aria-label="Close sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Agency Subheading */}
        <div className="px-4 py-2 bg-navy-950/50 border-b border-navy-800/50 shrink-0">
          <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-widest">
            Ministry of Home Affairs
          </p>
          <p className="text-[11px] text-navy-300 font-normal mt-0.5">
            Border Surveillance &amp; Control
          </p>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => { if (onClose) onClose(); }}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors duration-150 ${
                    isActive
                      ? "bg-navy-800 text-white shadow-sm"
                      : "text-navy-300 hover:bg-navy-800/60 hover:text-navy-100"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active left bar indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-status-info rounded-r animate-sidebar-indicator" />
                    )}
                    <Icon
                      size={15}
                      className={`shrink-0 transition-colors duration-150 ${
                        isActive ? "text-white" : "text-navy-400 group-hover:text-navy-200"
                      }`}
                    />
                    <span className="truncate leading-none">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Section — System Telemetry & End Session */}
        <div className="border-t border-navy-800/80 bg-navy-950/50 p-2.5 space-y-2 shrink-0">
          {/* Secure connection status */}
          <div className="px-2.5 py-1.5 rounded-lg bg-navy-900/80 border border-navy-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-cctv-pulse shrink-0" />
              <span className="text-[10px] font-semibold text-navy-300 uppercase tracking-wide">
                Secure VPN
              </span>
            </div>
            <span className="text-[10px] font-mono text-navy-400">38ms</span>
          </div>

          {/* End Terminal Session */}
          <button
            onClick={handleLogout}
            title="End terminal session"
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-400 hover:text-status-critical hover:bg-navy-800/80 border border-transparent hover:border-navy-700/80 transition-colors cursor-pointer"
            aria-label="Logout from terminal"
          >
            <IconLogout size={14} />
            <span>End Session</span>
          </button>
        </div>
      </aside>
    </>
  );
}
