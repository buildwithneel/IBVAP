import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconAnalysis,
  IconCamera,
  IconDashboard,
  IconFleet,
  IconIntelligence,
  IconLogout,
  IconReports,
  IconSettings,
} from "./Icons";
import { IBVAPLogo } from "./EmblemMark";
import { useOfficerProfile } from "../context/OfficerProfileContext";
import { api } from "../services/api";
import { wsService } from "../services/websocket";
import { BackendUser } from "../types";

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  showProfile?: boolean;
  showOperatorProfile?: boolean;
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
  {
    label: "Settings",
    to: "/dashboard/settings",
    icon: IconSettings,
    end: false,
    desc: "CCTV & System Config",
  },
];

export default function Sidebar({
  isOpen = true,
  onClose,
  showProfile = false,
  showOperatorProfile,
}: SidebarProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openProfile } = useOfficerProfile();
  const [user, setUser] = useState<BackendUser | null>(api.getStoredUser());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(api.getStoredUser());
  }, []);

  // Close user profile popover on click outside
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  const urlProfileParam = searchParams.get("profile") ?? searchParams.get("showProfile");
  const isProfileVisible =
    urlProfileParam !== null
      ? urlProfileParam === "true" || urlProfileParam === "1"
      : showOperatorProfile !== undefined
      ? showOperatorProfile
      : showProfile;

  const handleLogout = async () => {
    try {
      wsService.disconnect();
      await api.logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const displayName = user?.name || "Duty Officer";
  const initials = displayName
    .split(" ")
    .filter((w) => w.match(/^[A-Z]/i))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "DO";

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
        className={`fixed top-0 bottom-0 left-0 z-50 w-[220px] bg-navy-900 border-r border-navy-800/80 text-navy-100 flex flex-col transition-transform duration-200 ease-out lg:static lg:translate-x-0 h-full ${
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

        {/* Agency Badge / Subheading */}
        <div className="px-4 py-2 bg-navy-950/50 border-b border-navy-800/50 shrink-0">
          <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-widest">
            Ministry of Home Affairs
          </p>
          <p className="text-[11px] text-navy-300 font-normal mt-0.5">
            Border Surveillance &amp; Control
          </p>
        </div>

        {/* Navigation */}
        <nav className="py-3 px-2.5 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => {
                  if (onClose) onClose();
                }}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors duration-150 ${
                    isActive
                      ? "bg-navy-800 text-white shadow-sm"
                      : "text-navy-300 hover:bg-navy-800/60 hover:text-navy-100"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
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

        <div className="flex-1 min-h-0" aria-hidden="true" />

        {/* Bottom area: USER / OPERATOR ACCOUNT ↓ SYSTEM API STATUS */}
        <div className="mt-auto border-t border-navy-800/80 bg-navy-950/60 p-2.5 space-y-2 shrink-0 relative">
          {/* USER / OPERATOR PROFILE MENU TRIGGER */}
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-navy-900/90 hover:bg-navy-800 border border-navy-800 hover:border-navy-700 transition-all text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-navy-600 group"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              aria-label="User Account and Session Menu"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative shrink-0">
                  <div className="w-6 h-6 rounded-md bg-navy-700 border border-navy-600 flex items-center justify-center text-[10px] font-bold text-white group-hover:border-navy-500 transition-colors">
                    {initials}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-status-live border border-navy-900 animate-cctv-pulse" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate leading-tight group-hover:text-blue-300 transition-colors">
                    {displayName}
                  </p>
                  <p className="text-[10px] text-navy-400 font-medium truncate leading-tight">
                    {user?.role || "Operator"}
                  </p>
                </div>
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-navy-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
                  userMenuOpen ? "rotate-180" : ""
                }`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Dropdown / Popover Menu */}
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 right-0 mb-1.5 bg-navy-900 border border-navy-700/90 rounded-xl shadow-2xl overflow-hidden z-50 divide-y divide-navy-800/80 text-[11px]"
                >
                  {/* Account Header */}
                  <div className="px-3 py-2 bg-navy-950/80">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-navy-400">
                      Operator Account
                    </p>
                    <p className="text-white font-medium truncate mt-0.5">
                      {displayName}
                    </p>
                    <p className="text-[9px] text-navy-400 font-mono truncate">
                      {user?.badgeNumber || user?.email || "Service ID: SSB-SEC-8421"}
                    </p>
                  </div>

                  {/* Supported Navigation & Profile Actions */}
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        openProfile(displayName);
                        if (onClose) onClose();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-navy-200 hover:text-white hover:bg-navy-800/90 transition-colors text-left cursor-pointer"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span>Profile / Account</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate("/dashboard/user-details");
                        if (onClose) onClose();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-navy-200 hover:text-white hover:bg-navy-800/90 transition-colors text-left cursor-pointer"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                      <span>Operator Details</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigate("/dashboard/settings");
                        if (onClose) onClose();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-navy-200 hover:text-white hover:bg-navy-800/90 transition-colors text-left cursor-pointer"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      <span>Preferences / Settings</span>
                    </button>
                  </div>

                  {/* System Status / Telemetry note */}
                  <div className="px-3 py-1.5 bg-navy-950/40 flex items-center justify-between text-[10px]">
                    <span className="text-navy-400">Node Gateway</span>
                    <span className="font-semibold text-emerald-400">ONLINE</span>
                  </div>

                  {/* Distinct Destructive Logout Action */}
                  <div className="p-1 bg-red-950/20">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-red-400 hover:text-white hover:bg-status-critical transition-colors text-left font-semibold cursor-pointer group"
                    >
                      <IconLogout size={13} className="text-red-400 group-hover:text-white transition-colors" />
                      <span>Log Out Session</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Existing SYSTEM API STATUS (Preserved underneath user profile menu) */}
          <div className="px-2.5 py-1.5 rounded-lg bg-navy-900/80 border border-navy-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-cctv-pulse shrink-0" />
              <span className="text-[10px] font-semibold text-navy-300 uppercase tracking-wide">
                SYSTEM API
              </span>
            </div>
            <span className="text-[10px] font-semibold text-navy-400">ONLINE</span>
          </div>
        </div>
      </aside>
    </>
  );
}
