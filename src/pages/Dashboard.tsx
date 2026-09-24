import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import StatsStrip from "../components/StatsStrip";
import CentralCameraFeed from "../components/CentralCameraFeed";
import OperationalRail from "../components/OperationalRail";
import { mockCameras, mockSystemMetrics } from "../data/mockData";
import { Camera, SystemMetrics } from "../types";
import { api } from "../services/api";

export default function Dashboard() {
  const [cameraList, setCameraList] = useState<Camera[]>(mockCameras);
  const [selectedCam, setSelectedCam] = useState<Camera>(mockCameras[0]);
  const [metrics, setMetrics] = useState<SystemMetrics>(mockSystemMetrics);

  useEffect(() => {
    let isMounted = true;
    async function fetchDashboardData() {
      try {
        const [statsRes, camsRes] = await Promise.allSettled([
          api.getStatistics(),
          api.getCameras(),
        ]);
        if (!isMounted) return;

        if (statsRes.status === "fulfilled" && statsRes.value) {
          setMetrics(statsRes.value);
        }
        if (camsRes.status === "fulfilled" && camsRes.value && camsRes.value.length > 0) {
          setCameraList(camsRes.value);
          setSelectedCam((prev) => {
            const found = camsRes.value.find((c) => c.id === prev.id);
            return found || camsRes.value[0];
          });
        }
      } catch (e) {
        console.warn("Using fallback dashboard data:", e);
      }
    }
    fetchDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Layout
      title="Surveillance &amp; Command Dashboard"
      subtitle="Border Area Monitoring Terminal — Sector Alpha to Delta"
    >
      <div className="space-y-5">
        {/* Top 5 Operational Summary Cards */}
        <StatsStrip metrics={metrics} />

        {/* Main Operational Area: Center Large CCTV Feed + Right Command Center Rail */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
          {/* Central Surveillance Viewport & Sector Camera Switcher */}
          <div className="space-y-4 min-w-0">
            <CentralCameraFeed
              initialCameraId={selectedCam.id}
              onCameraSelect={(cam) => setSelectedCam(cam)}
            />

            {/* Sector Auxiliary Camera Quick Thumbnails */}
            <div className="bg-gov-card rounded-xl border border-navy-200 p-3.5 shadow-gov">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-live" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800">
                    Active Sector Camera Feeds
                  </h3>
                </div>
                <span className="text-[11px] text-navy-500 font-mono">
                  Showing {Math.min(4, cameraList.length)} of {cameraList.length} Feeds
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {cameraList.slice(0, 4).map((cam) => {
                  const isSelected = cam.id === selectedCam.id;
                  const isLive = cam.status === "ACTIVE";
                  const isAlert = cam.status === "ALERT";

                  return (
                    <button
                      key={cam.id}
                      onClick={() => setSelectedCam(cam)}
                      className={`relative aspect-video rounded-lg overflow-hidden border text-left transition-all p-2 flex flex-col justify-between ${
                        isSelected
                          ? "border-navy-900 ring-2 ring-navy-900/30 bg-navy-950"
                          : "border-navy-200 bg-navy-900 hover:border-navy-400"
                      }`}
                    >
                      <div className="flex items-center justify-between z-10">
                        <span className="text-[10px] font-mono font-bold text-white px-1.5 py-0.5 rounded bg-black/60">
                          {cam.code}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isAlert
                              ? "bg-status-critical animate-cctv-pulse"
                              : isLive
                              ? "bg-status-live"
                              : "bg-navy-500"
                          }`}
                        />
                      </div>

                      <div className="z-10">
                        <p className="text-[10px] font-medium text-navy-200 truncate">
                          {cam.name}
                        </p>
                        <p className="text-[9px] text-navy-400 font-mono">{cam.postNumber}</p>
                      </div>

                      {/* Subtle wireframe overlay thumbnail effect */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right-Side Operational Information Rail (Command Center Telemetry) */}
          <div className="min-w-0">
            <OperationalRail />
          </div>
        </div>
      </div>
    </Layout>
  );
}
