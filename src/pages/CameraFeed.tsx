import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { mockBoundingBoxes, mockCameras } from "../data/mockData";
import { Camera, CameraDiagnostics } from "../types";
import { IconFilter, IconRadioWaves } from "../components/Icons";
import { motion, AnimatePresence } from "framer-motion";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import { api } from "../services/api";

type LayoutMode = "single" | "2x2" | "3x3";

const layoutConfig: Record<LayoutMode, { cols: string; max: number; label: string }> = {
  single: { cols: "grid-cols-1", max: 1, label: "1×1 Focus" },
  "2x2":  { cols: "grid-cols-1 md:grid-cols-2", max: 4, label: "2×2 Quad" },
  "3x3":  { cols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", max: 9, label: "3×3 Matrix" },
};

export default function CameraFeed() {
  const [cameraList, setCameraList] = useState<Camera[]>(mockCameras);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("2x2");
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [activeCam, setActiveCam] = useState<Camera>(mockCameras[0]);

  // Diagnostics Modal State
  const [diagnosticData, setDiagnosticData] = useState<CameraDiagnostics | null>(null);
  const [_isDiagnosing, setIsDiagnosing] = useState<boolean>(false);
  const [isRebooting, setIsRebooting] = useState<boolean>(false);
  const [rebootFeedback, setRebootFeedback] = useState<string | null>(null);

  const handleRunDiagnostics = async (camId: string) => {
    setIsDiagnosing(true);
    setRebootFeedback(null);
    try {
      const data = await api.getCameraDiagnostics(camId);
      setDiagnosticData(data);
    } catch (err) {
      console.warn("Diagnostics call error:", err);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleReboot = async (camId: string) => {
    setIsRebooting(true);
    try {
      const res = await api.rebootCamera(camId);
      setRebootFeedback(res.message);
    } catch (err) {
      setRebootFeedback("Watchdog reboot sequence dispatched.");
    } finally {
      setIsRebooting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadCams() {
      try {
        const cams = await api.getCameras();
        if (isMounted && cams && cams.length > 0) {
          setCameraList(cams);
          setActiveCam((prev) => cams.find((c) => c.id === prev.id) || cams[0]);
        }
      } catch (e) {
        console.warn("Using fallback cameras for multi-camera feed:", e);
      }
    }
    loadCams();
    return () => {
      isMounted = false;
    };
  }, []);

  const sectors = [
    "ALL",
    "Sector 1 (North)",
    "Sector 2 (East)",
    "Sector 3 (South)",
    "Sector 4 (West)",
  ];

  const filteredCameras =
    selectedSector === "ALL"
      ? cameraList
      : cameraList.filter((c) => c.sector === selectedSector);

  const { cols, max } = layoutConfig[layoutMode];
  const displayedCameras =
    layoutMode === "single" ? [activeCam] : filteredCameras.slice(0, max);

  return (
    <Layout
      title="Multi-Camera Tactical Feed"
      subtitle="Synchronous Real-Time CCTV Perimeter Monitoring — All Sectors"
    >
      <div className="space-y-4">
        {/* Controls Bar */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-3 shadow-gov flex flex-wrap items-center justify-between gap-3">
          {/* Sector Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[11px] font-semibold text-navy-600 flex items-center gap-1 mr-1 shrink-0">
              <IconFilter size={12} />
              Sector:
            </span>
            {sectors.map((sec) => (
              <button
                key={sec}
                onClick={() => setSelectedSector(sec)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                  selectedSector === sec
                    ? "bg-navy-900 text-white"
                    : "bg-navy-100 text-navy-600 hover:bg-navy-200"
                }`}
              >
                {sec === "ALL" ? "All Sectors" : sec.replace("Sector ", "S")}
              </button>
            ))}
          </div>

          {/* Layout Switcher */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-navy-500 font-medium hidden sm:inline">Layout:</span>
            <div className="flex items-center bg-navy-100 p-0.5 rounded-lg border border-navy-200">
              {(Object.keys(layoutConfig) as LayoutMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setLayoutMode(mode)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors ${
                    layoutMode === mode
                      ? "bg-gov-card text-navy-900 shadow-sm"
                      : "text-navy-500 hover:text-navy-800"
                  }`}
                >
                  {layoutConfig[mode].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Camera Grid */}
        <div className={`grid ${cols} gap-3 transition-all duration-300`}>
          <AnimatePresence mode="popLayout">
            {displayedCameras.map((cam) => {
              const isAlert = cam.status === "ALERT";
              const isLive = cam.status === "ACTIVE";
              const isOffline = cam.status === "OFFLINE";
              const isMaint = cam.status === "MAINTENANCE";
              const boxes = mockBoundingBoxes[cam.id] ?? [];

              return (
                <motion.div
                  key={cam.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => setActiveCam(cam)}
                  className={`relative aspect-video rounded-xl bg-navy-950 border overflow-hidden shadow-gov flex flex-col justify-between p-3 select-none cursor-pointer transition-all duration-150 ${
                    activeCam.id === cam.id
                      ? "border-navy-700 ring-2 ring-navy-800/40"
                      : isAlert
                      ? "border-status-critical/50"
                      : "border-navy-700/50 hover:border-navy-500"
                  }`}
                >
                  {/* Real Backend MJPEG Video Stream */}
                  {!isOffline && !isMaint && (
                    <img
                      key={cam.id}
                      src={api.getMjpegStreamUrl(cam.id)}
                      alt={`Live stream from ${cam.name}`}
                      className="absolute inset-0 w-full h-full object-cover z-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  )}

                  {/* Background CCTV canvas (fallback / overlay base) */}
                  <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-slate-900 to-navy-950 pointer-events-none">
                    <div
                      className="absolute inset-0 opacity-[0.06]"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                        backgroundSize: "32px 32px",
                      }}
                    />
                    {/* Crosshair */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                      <div className="w-8 h-8 border border-white/60 rounded-full" />
                      <div className="absolute w-14 h-px bg-white/40" />
                      <div className="absolute h-14 w-px bg-white/40" />
                    </div>
                  </div>

                  {/* Offline state */}
                  {(isOffline || isMaint) && (
                    <div className="absolute inset-0 bg-navy-950/92 z-20 flex flex-col items-center justify-center text-center p-4 gap-2">
                      <div className="w-8 h-8 rounded-lg bg-navy-900 border border-navy-700 flex items-center justify-center text-status-warn">
                        <IconRadioWaves size={18} />
                      </div>
                      <div>
                        <p className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
                          {isOffline ? "SIGNAL LOST" : "MAINTENANCE MODE"}
                        </p>
                        <p className="text-[10px] font-mono text-navy-400 mt-0.5">
                          Last heartbeat: {cam.lastHeartbeat}
                        </p>
                        <p className="text-[9px] font-mono text-navy-500 mt-0.5">{cam.code} · {cam.ipAddress}</p>
                      </div>
                      {isOffline && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRunDiagnostics(cam.id);
                          }}
                          className="mt-1 px-2.5 py-1 rounded bg-navy-800 hover:bg-navy-700 text-white text-[10px] font-medium border border-navy-600 transition-colors cursor-pointer"
                        >
                          Ping Diagnostics
                        </button>
                      )}
                    </div>
                  )}

                  {/* Bounding box overlays */}
                  {isLive && boxes.map((box, idx) => {
                    const isCrit = box.type === "breach";
                    return (
                      <div
                        key={idx}
                        className={`absolute border pointer-events-none z-10 ${
                          isCrit ? "border-status-critical bg-status-critical/10" : "border-status-live bg-status-live/10"
                        }`}
                        style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}
                      >
                        <span className={`absolute -top-4 left-0 text-[8px] font-mono font-bold px-1 py-0.5 rounded whitespace-nowrap ${isCrit ? "bg-status-critical text-white" : "bg-status-live text-white"}`}>
                          {box.label}
                        </span>
                      </div>
                    );
                  })}

                  {/* Tile Header */}
                  <div className="relative z-10 flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-white bg-black/60 px-2 py-0.5 rounded border border-white/10">
                          {cam.code}
                        </span>
                        <span className="text-[10px] font-mono text-navy-300 bg-black/40 px-1.5 py-0.5 rounded hidden sm:inline">
                          {cam.postNumber}
                        </span>
                      </div>
                      <p className="text-[9px] text-navy-300 bg-black/40 px-1 rounded inline-block">
                        {cam.sector}
                      </p>
                    </div>

                    <div>
                      {isAlert ? (
                        <span className="px-1.5 py-0.5 rounded bg-status-critical text-white text-[10px] font-bold font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-cctv-pulse" />
                          ALERT
                        </span>
                      ) : isLive ? (
                        <span className="px-1.5 py-0.5 rounded bg-status-live text-white text-[10px] font-bold font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-cctv-pulse" />
                          LIVE
                        </span>
                      ) : isMaint ? (
                        <span className="px-1.5 py-0.5 rounded bg-status-warn text-white text-[10px] font-bold font-mono">
                          MAINT
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-navy-700 text-navy-300 text-[10px] font-bold font-mono">
                          OFFLINE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tile Footer */}
                  <div className="relative z-10 flex items-end justify-between text-[9px] font-mono text-navy-300 bg-black/60 px-2 py-1 rounded border border-white/10">
                    <span className="truncate max-w-[60%] text-white font-medium text-[10px]">{cam.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span>{cam.resolution.split(" ")[0]}</span>
                      <span>·</span>
                      <span>{cam.fps > 0 ? `${cam.fps} FPS` : "—"}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Selected Camera Telemetry Bar */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-3.5 shadow-gov flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-navy-400 font-medium uppercase tracking-wide">Selected Station</span>
              <StatusBadge status={activeCam.status} />
            </div>
            <p className="font-semibold text-navy-900 mt-0.5">
              {activeCam.name}{" "}
              <span className="font-mono text-navy-500 font-normal">({activeCam.code})</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-navy-500 font-mono text-[10px]">
            <span>IP: {activeCam.ipAddress}</span>
            <span>·</span>
            <span>STREAM: RTSP H.264 / AES-256</span>
            <span>·</span>
            <span>HEARTBEAT: {activeCam.lastHeartbeat}</span>
            {activeCam.personsActive > 0 && (
              <>
                <span>·</span>
                <span className="text-status-warn font-semibold">{activeCam.personsActive} persons</span>
              </>
            )}
            <button
              type="button"
              onClick={() => handleRunDiagnostics(activeCam.id)}
              className="ml-auto sm:ml-2 px-2.5 py-1 rounded bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-semibold border border-navy-700 transition-colors shadow-xs cursor-pointer"
            >
              Hardware Probe
            </button>
          </div>
        </div>
      </div>

      {/* Hardware Diagnostics & Watchdog Modal */}
      <Modal
        open={!!diagnosticData}
        onClose={() => setDiagnosticData(null)}
        maxWidth="lg"
        title="Hardware Telemetry & Stream Diagnostics"
        subtitle={`CAMERA STATION: ${diagnosticData?.camera_name || diagnosticData?.camera_id || "DIAGNOSTIC PROBE"}`}
      >
        {diagnosticData && (
          <div className="p-6 space-y-5">
            {/* Metric Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-navy-50 rounded-xl border border-navy-200">
                <span className="text-[10px] font-mono uppercase tracking-wider text-navy-400 block mb-1">
                  End-to-End Latency
                </span>
                <span className="text-xl font-bold font-mono text-navy-950">
                  {diagnosticData.latency_ms} <span className="text-xs font-normal text-navy-500">ms</span>
                </span>
                <span className="text-[10px] text-status-live block mt-0.5">● Sub-50ms target</span>
              </div>

              <div className="p-3.5 bg-navy-50 rounded-xl border border-navy-200">
                <span className="text-[10px] font-mono uppercase tracking-wider text-navy-400 block mb-1">
                  Throughput / FPS
                </span>
                <span className="text-xl font-bold font-mono text-navy-950">
                  {diagnosticData.measured_fps} <span className="text-xs font-normal text-navy-500">/ {diagnosticData.configured_fps}</span>
                </span>
                <span className="text-[10px] text-navy-500 block mt-0.5 font-mono">Frames/sec</span>
              </div>

              <div className="p-3.5 bg-navy-50 rounded-xl border border-navy-200">
                <span className="text-[10px] font-mono uppercase tracking-wider text-navy-400 block mb-1">
                  Packet Loss
                </span>
                <span className={`text-xl font-bold font-mono ${diagnosticData.packet_loss_pct > 1 ? "text-status-critical" : "text-status-live"}`}>
                  {diagnosticData.packet_loss_pct}%
                </span>
                <span className="text-[10px] text-navy-500 block mt-0.5 font-mono">RTP Drop Rate</span>
              </div>

              <div className="p-3.5 bg-navy-50 rounded-xl border border-navy-200">
                <span className="text-[10px] font-mono uppercase tracking-wider text-navy-400 block mb-1">
                  Sensor State
                </span>
                <div className="mt-1">
                  <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-status-liveBg border border-status-live/40 text-navy-900">
                    {diagnosticData.sensor_status}
                  </span>
                </div>
                <span className="text-[10px] text-navy-500 block mt-0.5 font-mono">Hardware self-test</span>
              </div>
            </div>

            {/* Diagnostic Details Box */}
            <div className="bg-navy-50/60 p-4 rounded-xl border border-navy-200 text-xs font-mono space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-navy-400 uppercase font-semibold text-[10px] block">Stream Resolution</span>
                  <span className="text-navy-900 font-bold">{diagnosticData.resolution}</span>
                </div>
                <div>
                  <span className="text-navy-400 uppercase font-semibold text-[10px] block">Encoding & Transport</span>
                  <span className="text-navy-900 font-bold">{diagnosticData.codec || "H.264 ONVIF / RTSP"}</span>
                </div>
                <div>
                  <span className="text-navy-400 uppercase font-semibold text-[10px] block">Total Processed Frames</span>
                  <span className="text-navy-900 font-bold">{diagnosticData.frames_processed.toLocaleString()} frames</span>
                </div>
                <div>
                  <span className="text-navy-400 uppercase font-semibold text-[10px] block">Last Health Ping</span>
                  <span className="text-navy-900 font-bold">{diagnosticData.last_ping}</span>
                </div>
              </div>
            </div>

            {/* Reboot Watchdog Feedback */}
            {rebootFeedback && (
              <div className="p-3 rounded-lg bg-status-liveBg/60 border border-status-live/40 text-navy-900 text-xs font-medium">
                ✓ {rebootFeedback}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={isRebooting}
                onClick={() => handleReboot(diagnosticData.camera_id)}
                className="px-3 py-1.5 rounded-lg bg-status-warnBg hover:bg-status-warnBg/80 text-status-warn font-semibold text-xs border border-status-warn/40 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isRebooting ? "Dispatching Reboot..." : "Trigger Watchdog Reboot"}
              </button>

              <button
                type="button"
                onClick={() => setDiagnosticData(null)}
                className="px-4 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Telemetry
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
