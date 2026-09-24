import { useEffect, useState } from "react";
import { Camera } from "../types";
import { mockBoundingBoxes, mockCameras } from "../data/mockData";
import { IconCamera, IconRadioWaves } from "./Icons";
import { api } from "../services/api";

interface CentralCameraFeedProps {
  initialCameraId?: string;
  onCameraSelect?: (camera: Camera) => void;
}

export default function CentralCameraFeed({
  initialCameraId = "cam-01",
  onCameraSelect,
}: CentralCameraFeedProps) {
  const [cameraList, setCameraList] = useState<Camera[]>(mockCameras);
  const [selectedCamId, setSelectedCamId] = useState(initialCameraId);
  const [showOverlays, setShowOverlays] = useState(true);
  const [sensorMode, setSensorMode] = useState<"optical" | "thermal">("optical");
  const [timestamp, setTimestamp] = useState("");
  const [streamOnline, setStreamOnline] = useState(false);

  useEffect(() => {
    setStreamOnline(false);
  }, [selectedCamId]);

  useEffect(() => {
    let isMounted = true;
    async function loadCams() {
      try {
        const cams = await api.getCameras();
        if (isMounted && cams && cams.length > 0) {
          setCameraList(cams);
          if (!cams.some((c) => c.id === selectedCamId)) {
            setSelectedCamId(cams[0].id);
          }
        }
      } catch (e) {
        console.warn("Using fallback cameras for central feed:", e);
      }
    }
    loadCams();
    return () => {
      isMounted = false;
    };
  }, [selectedCamId]);

  const activeCamera =
    cameraList.find((c) => c.id === selectedCamId) || cameraList[0] || mockCameras[0];
  const boundingBoxes = mockBoundingBoxes[activeCamera.id] || [];

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimestamp(
        now.toLocaleTimeString("en-IN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " IST"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSelect = (cam: Camera) => {
    setSelectedCamId(cam.id);
    if (onCameraSelect) onCameraSelect(cam);
  };

  return (
    <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov flex flex-col">
      {/* CCTV Header Bar */}
      <div className="px-4 py-2.5 border-b border-navy-200 bg-navy-50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-navy-200 text-navy-800">
            <IconCamera size={14} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-navy-900">
            Live Surveillance Feed
          </span>
          <span className="text-xs text-navy-400 font-mono">|</span>
          <span className="text-xs font-mono font-semibold text-navy-700">
            {activeCamera.code}
          </span>
          <span className="text-xs text-navy-500 hidden sm:inline">
            — {activeCamera.name}
          </span>
        </div>

        {/* Quick Camera Selector Pills */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          {cameraList.slice(0, 4).map((cam) => (
            <button
              key={cam.id}
              onClick={() => handleSelect(cam)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors ${
                selectedCamId === cam.id
                  ? "bg-navy-900 text-white"
                  : "bg-navy-200/80 text-navy-700 hover:bg-navy-300"
              }`}
            >
              {cam.code}
            </button>
          ))}
        </div>
      </div>

      {/* Main CCTV Viewport Panel */}
      <div className="relative aspect-video sm:aspect-[16/9] w-full bg-navy-950 overflow-hidden select-none">
        {/* Real Backend MJPEG Video Stream Source */}
        {activeCamera.status !== "OFFLINE" && (
          <img
            key={activeCamera.id}
            src={api.getMjpegStreamUrl(activeCamera.id)}
            alt={`Live stream from ${activeCamera.name}`}
            className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
              streamOnline ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onError={() => setStreamOnline(false)}
            onLoad={() => setStreamOnline(true)}
          />
        )}

        {/* Realistic CCTV Background Canvas Simulation (Fallback when stream offline or loading) */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            streamOnline
              ? "opacity-0 pointer-events-none"
              : sensorMode === "thermal"
              ? "opacity-100 bg-gradient-to-tr from-slate-900 via-indigo-950 to-amber-950/40"
              : "opacity-100 bg-gradient-to-b from-navy-900 via-slate-900 to-navy-950"
          }`}
        >
          {/* Subtle surveillance scanline & grid texture */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          {/* Realistic physical scenery mockup (Fence line and border terrain) */}
          <svg
            className="absolute inset-0 w-full h-full opacity-30 pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 1000 600"
          >
            {/* Mountain / Ridge contour line in background */}
            <path
              d="M0,360 L120,330 L300,350 L520,310 L750,340 L1000,320 L1000,600 L0,600 Z"
              fill="#1e293b"
            />
            {/* Border perimeter fence poles */}
            {[60, 160, 260, 360, 460, 560, 660, 760, 860, 960].map((x) => (
              <g key={x}>
                <line x1={x} y1="340" x2={x} y2="520" stroke="#475569" strokeWidth="2.5" />
                <circle cx={x} cy="340" r="3" fill="#64748b" />
              </g>
            ))}
            {/* Barbed wire horizontal strands */}
            <line x1="0" y1="360" x2="1000" y2="360" stroke="#64748b" strokeWidth="1" strokeDasharray="6 3" />
            <line x1="0" y1="410" x2="1000" y2="410" stroke="#64748b" strokeWidth="1" strokeDasharray="6 3" />
            <line x1="0" y1="460" x2="1000" y2="460" stroke="#64748b" strokeWidth="1" strokeDasharray="6 3" />
            {/* Razor wire loop coils */}
            <path
              d="M0,355 Q 50,335 100,355 T 200,355 T 300,355 T 400,355 T 500,355 T 600,355 T 700,355 T 800,355 T 900,355 T 1000,355"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.5"
              opacity="0.6"
            />
          </svg>

          {/* Central subtle optical reticle / crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <div className="w-16 h-16 border border-white/60 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 border-t border-l border-white" />
            </div>
            <div className="absolute w-24 h-[1px] bg-white/40" />
            <div className="absolute h-24 w-[1px] bg-white/40" />
          </div>
        </div>

        {/* Offline State Banner (if camera is offline) */}
        {activeCamera.status === "OFFLINE" ? (
          <div className="absolute inset-0 bg-navy-950/90 flex flex-col items-center justify-center text-center p-6 z-20">
            <div className="w-12 h-12 rounded-xl bg-navy-900 border border-navy-700 flex items-center justify-center text-status-warn mb-3">
              <IconRadioWaves size={24} />
            </div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
              TELEMETRY SIGNAL LOST
            </h3>
            <p className="text-xs text-navy-400 mt-1 max-w-sm">
              No packet stream received from {activeCamera.ipAddress}. System diagnostics logged
              incident to Signals Maintenance.
            </p>
          </div>
        ) : null}

        {/* TOP CCTV OVERLAY (Real-time telemetry) */}
        <div className="absolute top-0 left-0 right-0 p-3 sm:p-4 flex items-start justify-between pointer-events-none z-10 font-mono text-white text-[11px] sm:text-xs">
          {/* Top Left: Camera identity & post */}
          <div className="space-y-0.5 drop-shadow-md">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white bg-black/50 px-2 py-0.5 rounded border border-white/20">
                {activeCamera.code}
              </span>
              <span className="text-navy-300 bg-black/40 px-1.5 py-0.5 rounded hidden sm:inline">
                {activeCamera.postNumber}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-navy-300 bg-black/30 px-1 rounded inline-block mt-0.5">
              {activeCamera.sector}
            </p>
          </div>

          {/* Top Right: Live indicator, FPS, and live timestamp */}
          <div className="text-right space-y-1 drop-shadow-md">
            <div className="flex items-center justify-end gap-2">
              {activeCamera.status === "ALERT" ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-status-critical text-white text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-cctv-pulse" />
                  ALERT ACTIVE
                </span>
              ) : activeCamera.status === "ACTIVE" ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-status-live text-white text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-cctv-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-navy-700 text-navy-300 text-[10px] font-bold">
                  OFFLINE
                </span>
              )}
              <span className="bg-black/50 px-1.5 py-0.5 rounded border border-white/20 text-navy-300">
                {activeCamera.fps} FPS
              </span>
            </div>
            <div className="text-white font-semibold tracking-wider bg-black/50 px-2 py-0.5 rounded border border-white/10 inline-block">
              {timestamp}
            </div>
          </div>
        </div>

        {/* DETECTIONS OVERLAY: Controlled, restrained bounding boxes */}
        {showOverlays && activeCamera.status !== "OFFLINE" && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {boundingBoxes.map((box, idx) => {
              const isCritical = box.type === "breach";
              const borderColor = isCritical ? "border-status-critical" : "border-status-live";
              const bgColor = isCritical ? "bg-status-critical/10" : "bg-status-live/10";
              const tagColor = isCritical ? "bg-status-critical text-white" : "bg-status-live text-white";

              return (
                <div
                  key={idx}
                  className={`absolute border-2 ${borderColor} ${bgColor} transition-all duration-300`}
                  style={{
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  }}
                >
                  {/* Restrained corner ticks */}
                  <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white" />

                  {/* Bounding box label */}
                  <span
                    className={`absolute -top-5 left-0 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold tracking-tight whitespace-nowrap shadow-sm ${tagColor}`}
                  >
                    {box.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* BOTTOM CCTV OVERLAY (Controls and telemetry) */}
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 flex items-end justify-between pointer-events-none z-10 font-mono text-white text-[11px]">
          {/* Bottom Left: Coordinates & Sensor status */}
          <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded border border-white/10 space-y-0.5">
            <div className="flex items-center gap-3 text-[10px] text-navy-300">
              <span>RES: {activeCamera.resolution}</span>
              <span>•</span>
              <span>ENC: AES-256</span>
              <span>•</span>
              <span>PTZ: AZ 184° / EL -6°</span>
            </div>
            <div className="text-[10px] text-white">
              STATION: {activeCamera.ipAddress} [STREAM: OK]
            </div>
          </div>

          {/* Bottom Right: Interactive Operator Toggles */}
          <div className="flex items-center gap-1.5 pointer-events-auto bg-black/60 backdrop-blur-sm p-1 rounded-lg border border-white/10">
            {/* Optical / Thermal toggle */}
            <button
              onClick={() =>
                setSensorMode((prev) => (prev === "optical" ? "thermal" : "optical"))
              }
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                sensorMode === "thermal"
                  ? "bg-amber-600 text-white"
                  : "bg-navy-800 text-navy-300 hover:text-white"
              }`}
              title="Toggle Thermal IR Sensor"
            >
              {sensorMode === "thermal" ? "IR THERMAL" : "RGB OPTICAL"}
            </button>

            {/* Overlays toggle */}
            <button
              onClick={() => setShowOverlays((prev) => !prev)}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                showOverlays
                  ? "bg-navy-700 text-white"
                  : "bg-navy-900 text-navy-400 hover:text-white"
              }`}
              title="Toggle AI Detection Bounding Boxes"
            >
              {showOverlays ? "AI BOXES: ON" : "AI BOXES: OFF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
