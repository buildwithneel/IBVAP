import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import StatsStrip from "../components/StatsStrip";
import TacticalSurveillanceMap from "../components/TacticalSurveillanceMap";
import OperationalRail from "../components/OperationalRail";
import { Camera, SystemMetrics } from "../types";
import { api } from "../services/api";
import { wsService } from "../services/websocket";
import { useSurveillanceStream } from "../context/SurveillanceStreamContext";

export default function Dashboard() {
  const { cameraList, activeCamera, setActiveCameraId } = useSurveillanceStream();
  const [metrics, setMetrics] = useState<SystemMetrics>({
    totalCameras: 0,
    activeCameras: 0,
    offlineCameras: 0,
    maintenanceCameras: 0,
    personsDetected: 0,
    vehiclesDetected: 0,
    criticalAlerts: 0,
    warningsToday: 0,
    streamLatencyMs: 0,
    networkThroughputMbps: 0,
    operationalStatus: "IDLE",
    defconLevel: "DEFCON-5 (NORMAL)",
  });

  useEffect(() => {
    let isMounted = true;
    async function fetchDashboardStats() {
      try {
        const stats = await api.getStatistics();
        if (isMounted && stats) {
          setMetrics(stats);
        }
      } catch (e) {
        console.warn("Error fetching dashboard statistics:", e);
      }
    }
    fetchDashboardStats();
    const interval = setInterval(fetchDashboardStats, 5000);

    const unsubAlerts = wsService.subscribeAlerts(() => {
      if (!isMounted) return;
      fetchDashboardStats();
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubAlerts();
    };
  }, []);

  // Dynamically compute camera count metrics based on live fleet state
  const activeCount = cameraList.filter((c) => c.status === "ACTIVE").length;
  const offlineCount = cameraList.filter((c) => c.status === "OFFLINE").length;
  const dynamicMetrics: SystemMetrics = {
    ...metrics,
    totalCameras: cameraList.length > 0 ? cameraList.length : metrics.totalCameras,
    activeCameras: cameraList.length > 0 ? activeCount : metrics.activeCameras,
    offlineCameras: cameraList.length > 0 ? offlineCount : metrics.offlineCameras,
  };

  return (
    <Layout
      title="Surveillance &amp; Command Dashboard"
      subtitle="Border Area Monitoring Terminal — Real Backend Ingestion"
    >
      <div className="space-y-5">
        {/* Top Operational Summary Cards with Dynamic Camera Counts */}
        <StatsStrip metrics={dynamicMetrics} />

        {/* Main Operational Area: Center Large CCTV Feed + Right Command Center Rail */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
          {/* Central Surveillance Viewport & Sector Camera Switcher */}
          <div className="space-y-4 min-w-0">
            <TacticalSurveillanceMap
              onCameraSelect={(cam) => setActiveCameraId(cam.id)}
            />

            {/* Active Sector Camera Feeds - All Simulated Cameras Displayed Independently */}
            {cameraList.length > 0 && (
              <div className="bg-gov-card rounded-xl border border-navy-200 p-3.5 shadow-gov">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-status-live animate-pulse" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800">
                      Active Sector Camera Feeds
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {activeCount} Online
                    </span>
                    <span className="text-[11px] font-mono text-navy-500">
                      {cameraList.length} Total Feeds
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 max-h-80 overflow-y-auto p-1">
                  {cameraList.map((cam) => {
                    const isSelected = activeCamera?.id === cam.id;
                    const isLive = cam.status === "ACTIVE";
                    const isAlert = cam.status === "ALERT";
                    const isSim = Boolean(
                      cam.isSimulated ||
                      cam.sourceType === "file" ||
                      cam.sourceType === "simulated" ||
                      cam.name?.includes("TEST STREAM") ||
                      cam.id.startsWith("SIM-CAM-")
                    );

                    // Extract clean assigned video file name
                    const videoName = cam.name.includes("[") && cam.name.includes("]")
                      ? cam.name.substring(cam.name.indexOf("[") + 1, cam.name.lastIndexOf("]"))
                      : cam.name.replace(/^SIM-CAM-\d+\s*/, "");

                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => setActiveCameraId(cam.id)}
                        className={`relative aspect-video rounded-lg overflow-hidden border text-left transition-all p-2 flex flex-col justify-between cursor-pointer group ${
                          isSelected
                            ? "border-navy-900 ring-2 ring-navy-900/40 bg-navy-950 shadow-md"
                            : "border-navy-200 bg-navy-900 hover:border-navy-400 hover:shadow-xs"
                        }`}
                        title={`${cam.code} • ${cam.name} (${isLive ? "ONLINE" : "OFFLINE"})`}
                      >
                        {/* Live video background for simulated camera or MJPEG stream */}
                        {isLive && (
                          isSim && cam.videoUrl ? (
                            <video
                              src={cam.videoUrl}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="absolute inset-0 w-full h-full object-cover z-0 opacity-60 group-hover:opacity-80 transition-opacity"
                            />
                          ) : (
                            <img
                              src={api.getMjpegStreamUrl(cam.id)}
                              alt={cam.name}
                              className="absolute inset-0 w-full h-full object-cover z-0 opacity-60 group-hover:opacity-80 transition-opacity"
                            />
                          )
                        )}

                        <div className="flex items-center justify-between z-10 w-full">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 rounded bg-black/70 border border-white/20">
                              {cam.code}
                            </span>
                            {isSim && (
                              <span className="text-[8px] font-mono font-bold text-navy-950 bg-amber-400 px-1 py-0.5 rounded shadow-2xs">
                                TEST
                              </span>
                            )}
                          </div>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold ${
                              isAlert
                                ? "bg-status-critical text-white animate-cctv-pulse"
                                : isLive
                                ? "bg-emerald-500 text-white"
                                : "bg-navy-700 text-navy-300"
                            }`}
                          >
                            {isLive ? "ONLINE" : "OFFLINE"}
                          </span>
                        </div>

                        <div className="z-10 w-full">
                          <p className="text-[10px] font-semibold text-white truncate drop-shadow-sm" title={videoName}>
                            {videoName}
                          </p>
                          <p className="text-[9px] text-navy-300 font-mono drop-shadow-sm truncate">
                            {cam.postNumber ? `${cam.postNumber} · ` : ""}{cam.sector}
                          </p>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40 pointer-events-none" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right-Side Operational Information Rail */}
          <div className="min-w-0">
            <OperationalRail />
          </div>
        </div>
      </div>
    </Layout>
  );
}
