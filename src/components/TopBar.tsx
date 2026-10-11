import { useEffect, useRef, useState } from "react";
import { IconMenu, IconShield } from "./Icons";
import { SecurityAlert, BackendUser } from "../types";
import { AnimatePresence, motion } from "framer-motion";
import { useOfficerProfile } from "../context/OfficerProfileContext";
import { useWebSocketStatus, wsService } from "../services/websocket";
import { useSurveillanceStream } from "../context/SurveillanceStreamContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../services/api";
import { fetchLiveWeather, WeatherData } from "../services/weatherService";
import { Sun, Moon, Droplets, Wind, RefreshCw, MapPin } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  onToggleSidebar?: () => void;
}

export default function TopBar({ title, subtitle, onToggleSidebar }: TopBarProps) {
  const { openProfile } = useOfficerProfile();
  const wsStatus = useWebSocketStatus();
  const { cameraList, streamStatus } = useSurveillanceStream();
  const activeCamerasCount = cameraList.filter((c) => c.status === "ACTIVE").length;
  const isAnyStreaming = (activeCamerasCount > 0 || streamStatus.is_streaming) && wsStatus === "connected";
  const { isDark, toggleTheme } = useTheme();
  const [now, setNow] = useState(new Date());
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<SecurityAlert[]>([]);
  const [user, setUser] = useState<BackendUser | null>(api.getStoredUser());
  const alertDropRef = useRef<HTMLDivElement>(null);
  const weatherDropRef = useRef<HTMLDivElement>(null);

  // Real meteorological telemetry state via Open-Meteo
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherRefreshing, setWeatherRefreshing] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);

  const loadWeather = async (force: boolean = false) => {
    if (force) setWeatherRefreshing(true);
    try {
      const data = await fetchLiveWeather(force);
      setWeather(data);
    } catch (err) {
      console.warn("Weather telemetry fetch failed:", err);
    } finally {
      setWeatherLoading(false);
      setWeatherRefreshing(false);
    }
  };

  useEffect(() => {
    loadWeather(false);
    // Periodically update live weather every 10 minutes
    const interval = setInterval(() => loadWeather(true), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setUser(api.getStoredUser());
  }, []);

  const displayName = user?.name || "Duty Officer";
  const initials = displayName
    .split(" ")
    .filter((w) => w.match(/^[A-Z]/i))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "DO";

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function fetchAlerts() {
      try {
        const alerts = await api.getAlerts();
        if (isMounted && alerts) {
          setActiveAlerts(alerts);
        }
      } catch (e) {
        console.warn("Failed to fetch topbar alerts:", e);
      }
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);

    const unsubAlerts = wsService.subscribeAlerts((incomingAlert: SecurityAlert) => {
      if (!isMounted) return;
      setActiveAlerts((prev) => {
        const idx = prev.findIndex((a) => a.id === incomingAlert.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...incomingAlert };
          return next;
        }
        return [incomingAlert, ...prev];
      });
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubAlerts();
    };
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

  // Close weather dropdown on outside click
  useEffect(() => {
    if (!weatherOpen) return;
    const handler = (e: MouseEvent) => {
      if (weatherDropRef.current && !weatherDropRef.current.contains(e.target as Node)) {
        setWeatherOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [weatherOpen]);

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

  const unresolvedCritical = activeAlerts.filter(
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
        {/* Operational Status / Live Stream Indicator */}
        <div
          title={
            wsStatus !== "connected"
              ? "Surveillance WebSocket disconnected — Reconnecting..."
              : isAnyStreaming
              ? `Live Surveillance Stream Active — ${activeCamerasCount} camera(s) streaming`
              : "Surveillance streams stopped / on standby"
          }
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold border transition-colors ${
            wsStatus !== "connected"
              ? "bg-navy-100 text-navy-500 border-navy-300"
              : isAnyStreaming
              ? "bg-status-liveBg text-status-live border-status-live/30"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsStatus !== "connected"
                ? "bg-navy-400"
                : isAnyStreaming
                ? "bg-status-live animate-cctv-pulse"
                : "bg-amber-500"
            }`}
          />
          <span className="text-[10px] uppercase tracking-wide font-mono">
            {wsStatus !== "connected"
              ? "WS: OFFLINE"
              : isAnyStreaming
              ? `LIVE STREAM (${activeCamerasCount || streamStatus.active_count} ACTIVE)`
              : "STREAMS STANDBY"}
          </span>
        </div>

        {/* Theme Toggle Button: Light / Dark Mode */}
        <button
          type="button"
          onClick={toggleTheme}
          role="switch"
          aria-checked={isDark}
          aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          title={`Theme: ${isDark ? "Tactical Dark" : "Command Light"} Mode. Click to switch.`}
          className={`relative flex items-center gap-2 px-2.5 py-1 rounded-lg border font-semibold text-xs transition-all cursor-pointer select-none group focus:outline-none focus:ring-2 ${
            isDark
              ? "bg-navy-800/90 border-navy-700 text-amber-300 hover:bg-navy-700 hover:border-amber-400/40 focus:ring-amber-400/30"
              : "bg-navy-50 border-navy-200 text-navy-800 hover:bg-navy-100 hover:text-navy-950 focus:ring-navy-400/30"
          }`}
        >
          <div className="relative w-4 h-4 flex items-center justify-center">
            {isDark ? (
              <Sun size={14} className="text-amber-400 transition-transform group-hover:rotate-45" />
            ) : (
              <Moon size={14} className="text-indigo-600 transition-transform group-hover:-rotate-12" />
            )}
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold">
            {isDark ? "Dark" : "Light"}
          </span>
          {/* Subtle sliding thumb indicator */}
          <div
            className={`w-7 h-3.5 rounded-full p-0.5 transition-colors flex items-center ${
              isDark ? "bg-amber-400/20 justify-end" : "bg-navy-200 justify-start"
            }`}
          >
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={`w-2.5 h-2.5 rounded-full shadow-xs ${
                isDark ? "bg-amber-400" : "bg-navy-600"
              }`}
            />
          </div>
        </button>

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
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-status-critical text-white text-[9px] font-bold flex items-center justify-center">
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
                  <span className="text-[10px] font-medium text-navy-500">
                    {activeAlerts.filter(a => a.status !== "resolved").length} active
                  </span>
                </div>
                <div className="divide-y divide-navy-100 max-h-64 overflow-y-auto">
                  {activeAlerts.filter(a => a.status !== "resolved").length === 0 ? (
                    <div className="p-3 text-center text-xs text-navy-400">
                      No active alerts.
                    </div>
                  ) : (
                    activeAlerts.filter(a => a.status !== "resolved").map((alert) => (
                      <div key={alert.id} className={`px-3 py-2.5 ${alert.severity === "critical" ? "bg-status-criticalBg/20" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-navy-900 leading-tight truncate">{alert.title}</p>
                            <p className="text-[10px] text-navy-500 mt-0.5"><span className="font-mono">{alert.cameraCode}</span> · {alert.sector}</p>
                          </div>
                          <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                            alert.severity === "critical"
                              ? "bg-status-critical text-white"
                              : "bg-status-warnBg text-status-warn border border-status-warn/30"
                          }`}>
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-navy-400 mt-1">{alert.timestamp}</p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Real-time Meteorological Sector Weather (Open-Meteo Free Tier API) */}
        <div ref={weatherDropRef} className="relative hidden md:block shrink-0">
          <button
            type="button"
            onClick={() => setWeatherOpen((p) => !p)}
            className="flex items-center gap-1.5 bg-navy-50 hover:bg-navy-100 border border-navy-200 px-2.5 py-1 rounded-lg text-navy-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-navy-400/30 group"
            title={`Sector Weather: ${weather?.city || "Vadodara"} · ${weather ? `${weather.temp}°C ${weather.condition}` : "Loading live telemetry..."}. Click for details.`}
            aria-label="Sector Weather Telemetry"
          >
            <span className="text-sm leading-none select-none group-hover:scale-110 transition-transform">
              {weather?.icon || "☀"}
            </span>
            <span className="text-[11px] font-semibold text-navy-800 font-mono">
              {weatherLoading && !weather ? "--" : `${weather?.temp ?? 28}°C`}
            </span>
            <span className="text-[10px] text-navy-500 font-medium hidden lg:inline max-w-[85px] truncate">
              {weather?.city || "Vadodara"}
            </span>
            {weatherRefreshing && (
              <RefreshCw size={10} className="text-blue-500 animate-spin ml-0.5" />
            )}
          </button>

          {/* Interactive Weather Telemetry Popover */}
          <AnimatePresence>
            {weatherOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-72 bg-gov-card border border-navy-200 rounded-xl shadow-govLg overflow-hidden z-50 p-3.5"
              >
                {/* Popover Header */}
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-navy-100">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-status-live animate-cctv-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-navy-700">
                      Live Weather Telemetry
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-navy-400">
                    OPEN-METEO API
                  </span>
                </div>

                {/* Primary Temp & Condition Display */}
                <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-navy-50 border border-navy-200/70 mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl select-none leading-none">
                      {weather?.icon || "☀"}
                    </span>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-mono text-navy-900 leading-none">
                          {weather?.temp ?? 28}°C
                        </span>
                        {weather && (
                          <span className="text-[10px] text-navy-500">
                            (Feels {weather.apparentTemp}°C)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-navy-700 mt-0.5">
                        {weather?.condition || "Clear Daylight"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-navy-200/80 text-navy-700">
                      <MapPin size={9} />
                      {weather?.city || "Vadodara"}
                    </span>
                    {weather && (
                      <p className="text-[9px] font-mono text-navy-400 mt-1">
                        {weather.latitude}°N, {weather.longitude}°E
                      </p>
                    )}
                  </div>
                </div>

                {/* Tactical Parameters Matrix */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="bg-navy-50 p-2 rounded-lg border border-navy-200/60">
                    <span className="text-[9px] text-navy-400 uppercase font-semibold flex items-center gap-1">
                      <Droplets size={10} className="text-blue-500" /> Humidity
                    </span>
                    <p className="text-xs font-bold font-mono text-navy-800 mt-0.5">
                      {weather ? `${weather.humidity}%` : "--"}
                    </p>
                  </div>

                  <div className="bg-navy-50 p-2 rounded-lg border border-navy-200/60">
                    <span className="text-[9px] text-navy-400 uppercase font-semibold flex items-center gap-1">
                      <Wind size={10} className="text-teal-500" /> Wind Velocity
                    </span>
                    <p className="text-xs font-bold font-mono text-navy-800 mt-0.5">
                      {weather ? `${weather.windSpeed} km/h` : "--"}
                    </p>
                  </div>

                  <div className="bg-navy-50 p-2 rounded-lg border border-navy-200/60">
                    <span className="text-[9px] text-navy-400 uppercase font-semibold flex items-center gap-1">
                      ☁ Atmosphere
                    </span>
                    <p className="text-[10px] font-semibold text-navy-800 mt-0.5 truncate" title={weather?.conditionDescription}>
                      {weather?.conditionDescription || "Good Operational Visibility"}
                    </p>
                  </div>

                  <div className="bg-navy-50 p-2 rounded-lg border border-navy-200/60">
                    <span className="text-[9px] text-navy-400 uppercase font-semibold flex items-center gap-1">
                      🌧 Precipitation
                    </span>
                    <p className="text-xs font-bold font-mono text-navy-800 mt-0.5">
                      {weather ? `${weather.precipitation} mm` : "0.0 mm"}
                    </p>
                  </div>
                </div>

                {/* Footer Sync & Refresh Button */}
                <div className="flex items-center justify-between pt-2 border-t border-navy-100 text-[10px]">
                  <span className="text-navy-400 font-mono">
                    {weather ? `Synced: ${weather.lastUpdated} IST` : "Updating..."}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadWeather(true);
                    }}
                    disabled={weatherRefreshing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-navy-100 hover:bg-navy-200 text-navy-700 font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw size={10} className={weatherRefreshing ? "animate-spin" : ""} />
                    {weatherRefreshing ? "Syncing..." : "Refresh"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Real-time IST Clock: Date in Noto Sans, Time in IBM Plex Mono */}
        <div className="flex items-center gap-1.5 bg-navy-50 border border-navy-200 px-2.5 py-1 rounded-lg shrink-0">
          <span className="text-[10px] text-navy-600 font-medium hidden sm:inline">{formattedDate}</span>
          <span className="text-[10px] text-navy-300 hidden sm:inline">|</span>
          <span className="text-[11px] font-bold font-mono text-navy-800">{formattedTime} IST</span>
        </div>

        {/* Canonical User Profile Trigger Button (Swapped to position of Clock) */}
        <button
          type="button"
          onClick={() => openProfile(displayName)}
          className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-navy-50 hover:bg-navy-100 border border-navy-200 text-navy-900 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-navy-400 group shrink-0"
          title={`Operator Profile: ${displayName}`}
          aria-label={`Open profile for ${displayName}`}
        >
          <div className="w-5 h-5 rounded-md bg-navy-800 border border-navy-700 flex items-center justify-center text-[9px] font-semibold text-white shrink-0 group-hover:bg-navy-900 transition-colors select-none">
            {initials}
          </div>
          <span className="text-xs font-semibold text-navy-900 group-hover:text-blue-700 transition-colors tracking-tight hidden sm:inline">
            {displayName}
          </span>
        </button>

        {/* Security Clearance Tag (Maintained position) */}
        <div className="hidden xl:flex items-center gap-1.5 text-navy-600 bg-navy-50 border border-navy-200 px-2.5 py-1 rounded-lg shrink-0">
          <IconShield size={11} className="text-navy-600" />
          <span className="text-[10px] font-semibold font-mono">{user?.role || "Duty Officer"}</span>
        </div>
      </div>
    </header>
  );
}
