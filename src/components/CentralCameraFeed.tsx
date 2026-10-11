import { useEffect, useState, useRef } from "react";
import { Camera, BoundingBox, TestStreamStatus } from "../types";
import {
  IconCamera,
  IconRadioWaves,
  IconPlay,
  IconPause,
  IconSquare,
  IconRepeat,
  IconVideo,
  IconFilm,
  IconRefresh,
} from "./Icons";
import { api } from "../services/api";
import { useSurveillanceStream } from "../context/SurveillanceStreamContext";
import TestStreamingModal from "./TestStreamingModal";
import { VirtualFenceManager } from "./VirtualFenceManager";
import PTZControlPanel, { ViewportTransform } from "./PTZControlPanel";

interface CentralCameraFeedProps {
  initialCameraId?: string;
  onCameraSelect?: (camera: Camera) => void;
}

export default function CentralCameraFeed({
  initialCameraId,
  onCameraSelect,
}: CentralCameraFeedProps) {
  const {
    cameraList,
    activeCameraId,
    activeCamera: contextActiveCam,
    setActiveCameraId,
    streamMode,
    setStreamMode,
    toggleStreamMode,
    streamRevision,
    streamStatus,
    refreshCameras,
  } = useSurveillanceStream();

  const [showOverlays, setShowOverlays] = useState(true);
  const [timestamp, setTimestamp] = useState("");
  const [streamOnline, setStreamOnline] = useState(false);

  // PTZ Viewport State (Zoom & Pan/Tilt transform for viewport feedback)
  const [showPtzPanel, setShowPtzPanel] = useState(false);
  const [viewportTransform, setViewportTransform] = useState<ViewportTransform>({
    pan: 0,
    tilt: 0,
    zoom: 1.0,
  });

  // Thermal & Night Vision States
  const [thermalMode, setThermalMode] = useState<"off" | "ironbow" | "rainbow" | "white_hot" | "black_hot">("off");
  const [thermalInfo, setThermalInfo] = useState<{ is_simulated: boolean; radiometric: boolean } | null>(null);
  const [nightVisionMode, setNightVisionMode] = useState<"auto" | "day" | "night" | "low_light_enhancement">("auto");
  const [nightVisionInfo, setNightVisionInfo] = useState<{ hardware_ir_supported: boolean; digital_enhancement_active: boolean } | null>(null);

  // Native Video Player State for Simulated Cameras
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Test Streaming & Fence Controls
  const [showTestModal, setShowTestModal] = useState(false);
  const [showFenceModal, setShowFenceModal] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  const [snapshotFeedback, setSnapshotFeedback] = useState<string | null>(null);

  const handleCaptureSnapshot = async () => {
    if (!activeCamera?.id) return;
    setIsCapturingSnapshot(true);
    setSnapshotFeedback(null);
    try {
      const res = await api.captureCameraSnapshot(activeCamera.id);
      setSnapshotFeedback(`Snapshot saved! SHA: ${res.sha256.slice(0, 12)}...`);
      setTimeout(() => setSnapshotFeedback(null), 4000);
    } catch (err: any) {
      console.error("Snapshot capture error:", err);
      setSnapshotFeedback(err?.message || "Snapshot capture failed");
      setTimeout(() => setSnapshotFeedback(null), 4000);
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  // Active camera resolved from context with initialCameraId sync

  const activeCamera =
    (activeCameraId ? cameraList.find((c) => c.id === activeCameraId) : null) ||
    contextActiveCam ||
    cameraList[0];

  useEffect(() => {
    if (initialCameraId && initialCameraId !== activeCameraId) {
      setActiveCameraId(initialCameraId);
    }
  }, [initialCameraId, activeCameraId, setActiveCameraId]);

  useEffect(() => {
    const isOnline = activeCamera?.status === "ACTIVE";
    setStreamOnline(isOnline);
    setVideoError(null);
    setIsPlaying(true);
    setViewportTransform({ pan: 0, tilt: 0, zoom: 1.0 });
  }, [activeCamera?.id, activeCamera?.status]);

  // Load Camera's active Thermal and Night Vision configuration
  useEffect(() => {
    if (activeCamera?.id) {
      api.getThermalStatus(activeCamera.id).then((res) => {
        setThermalMode(res.thermal_mode || "off");
        setThermalInfo({ is_simulated: res.is_simulated, radiometric: res.radiometric });
      }).catch(() => {});

      api.getNightVisionStatus(activeCamera.id).then((res) => {
        setNightVisionMode(res.mode || "auto");
        setNightVisionInfo({
          hardware_ir_supported: res.hardware_ir_supported,
          digital_enhancement_active: res.digital_enhancement_active,
        });
      }).catch(() => {});
    }
  }, [activeCamera?.id]);

  const handleSetThermalMode = async (mode: "off" | "ironbow" | "rainbow" | "white_hot" | "black_hot") => {
    if (!activeCamera) return;
    setThermalMode(mode);
    try {
      const res = await api.setThermalConfig(activeCamera.id, {
        enabled: mode !== "off",
        colormap: mode === "off" ? undefined : mode,
      });
      setThermalInfo({
        is_simulated: res.is_simulated,
        radiometric: res.radiometric,
      });
    } catch (e) {
      console.warn("Failed to set thermal config:", e);
    }
  };

  const handleSetNightVisionMode = async (mode: "auto" | "day" | "night" | "low_light_enhancement") => {
    if (!activeCamera) return;
    setNightVisionMode(mode);
    try {
      const res = await api.setNightVisionConfig(activeCamera.id, { mode });
      setNightVisionInfo({
        hardware_ir_supported: res.hardware_ir_supported,
        digital_enhancement_active: res.digital_enhancement_active,
      });
    } catch (e) {
      console.warn("Failed to set night vision config:", e);
    }
  };

  const isSimulated = Boolean(
    activeCamera?.isSimulated ||
    activeCamera?.sourceType === "file" ||
    activeCamera?.sourceType === "simulated" ||
    activeCamera?.name?.includes("TEST STREAM")
  );

  const boundingBoxes: BoundingBox[] = [];

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
    setActiveCameraId(cam.id);
    if (onCameraSelect) onCameraSelect(cam);
  };

  // Video playback controls
  const handlePlay = async () => {
    if (activeCamera?.id && isSimulated) {
      try {
        await api.resumeTestStream(activeCamera.id);
      } catch (e) {
        console.warn("Failed to resume stream worker:", e);
      }
    }
    if (videoRef.current) {
      videoRef.current.play();
    }
    setIsPlaying(true);
  };

  const handlePause = async () => {
    if (activeCamera?.id && isSimulated) {
      try {
        await api.pauseTestStream(activeCamera.id);
      } catch (e) {
        console.warn("Failed to pause stream worker:", e);
      }
    }
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
  };

  const handleReplay = async () => {
    if (activeCamera?.id && isSimulated) {
      try {
        await api.replayTestStream(activeCamera.id);
      } catch (e) {
        console.warn("Failed to replay stream worker:", e);
      }
    }
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
    setIsPlaying(true);
  };

  const handleStop = async () => {
    if (activeCamera?.id && isSimulated) {
      try {
        await api.stopSingleTestStream(activeCamera.id);
        await refreshCameras();
      } catch (e) {
        console.warn("Failed to stop stream worker:", e);
      }
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  };

  const handleToggleLoop = async () => {
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    if (activeCamera?.id && isSimulated) {
      try {
        await api.setTestStreamLoop(activeCamera.id, nextLoop);
      } catch (e) {
        console.warn("Failed to toggle loop on stream worker:", e);
      }
    }
    if (videoRef.current) {
      videoRef.current.loop = nextLoop;
    }
  };

  const handleQuickToggleStreaming = async () => {
    setIsActionLoading(true);
    try {
      if (streamStatus.is_streaming) {
        await api.stopTestStreaming({ all: true });
      } else {
        await api.startTestStreaming({ all: true, loop: true });
      }
      await refreshCameras();
    } catch {
      setShowTestModal(true);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Compute playable video URL for simulated stream
  const computedVideoUrl = activeCamera?.videoUrl || (
    activeCamera?.streamUrl?.startsWith("http")
      ? activeCamera.streamUrl
      : activeCamera?.streamUrl?.includes("storage")
      ? `${api.getBaseUrl()}/${activeCamera.streamUrl.replace(/\\/g, "/").replace(/^\//, "")}`
      : isSimulated
      ? `${api.getBaseUrl()}/api/v1/test-streams/video/${encodeURIComponent(
          activeCamera?.streamUrl?.replace(/\\/g, "/").split("/").pop() || ""
        )}`
      : undefined
  );

  if (!activeCamera) {
    return (
      <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov flex flex-col">
        <div className="px-4 py-2.5 border-b border-navy-200 bg-navy-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconCamera size={14} className="text-navy-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-navy-900">
              Live Surveillance Feed
            </span>
          </div>
          <button
            onClick={() => setShowTestModal(true)}
            className="px-3 py-1.5 rounded-lg bg-navy-900 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <IconVideo size={13} />
            <span>Start Test Streaming</span>
          </button>
        </div>
        <div className="relative aspect-video sm:aspect-[16/9] w-full bg-navy-950 flex flex-col items-center justify-center p-6 text-center z-0">
          <div className="w-12 h-12 rounded-xl bg-navy-900 border border-navy-700 flex items-center justify-center text-navy-400 mb-3">
            <IconCamera size={24} />
          </div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
            NO CAMERAS CONNECTED
          </h3>
          <p className="text-xs text-navy-400 mt-1 max-w-sm">
            No active cameras registered in the system. Use the button above to launch simulated CCTV video streaming for testing.
          </p>
        </div>

        <TestStreamingModal
          isOpen={showTestModal}
          onClose={() => setShowTestModal(false)}
          onStreamStarted={() => {
            refreshCameras();
            setShowTestModal(false);
          }}
          cameras={cameraList}
          selectedCameraId={undefined}
        />
      </div>
    );
  }

  return (
    <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov flex flex-col">
      {/* CCTV Header Bar */}
      <div className="px-4 py-2.5 border-b border-navy-200 bg-navy-50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
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

          {/* Differentiate Simulated from Real Physical Cameras */}
          {isSimulated && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <IconFilm size={11} />
              <span>TEST STREAM (SIMULATED)</span>
            </span>
          )}
        </div>

        {/* Action Controls & Quick Camera Selector */}
        <div className="flex items-center gap-2">
          {/* Quick Start / Stop Test Streaming Button in Viewport */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleQuickToggleStreaming}
              disabled={isActionLoading}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50 ${
                streamStatus.is_streaming
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-navy-900 hover:bg-navy-800 text-white"
              }`}
              title={streamStatus.is_streaming ? "Stop active simulated video stream" : "Start simulated video streaming from local files"}
            >
              {streamStatus.is_streaming ? <IconSquare size={12} /> : <IconPlay size={12} />}
              <span>{streamStatus.is_streaming ? "Stop Streaming" : "Start Test Streaming"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              className="p-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-navy-700 transition-colors cursor-pointer"
              title="Configure Simulated Videos & Feeds"
            >
              <IconVideo size={13} />
            </button>
          </div>

          <div className="h-4 w-px bg-stone-300 mx-0.5 hidden sm:block" />

          {/* Quick Camera Selector Pills */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-md scrollbar-none">
            {cameraList.map((cam) => {
              const camIsSim = Boolean(
                cam.isSimulated ||
                cam.sourceType === "file" ||
                cam.sourceType === "simulated" ||
                cam.name?.includes("TEST STREAM")
              );
              return (
                <button
                  key={cam.id}
                  onClick={() => handleSelect(cam)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors flex items-center gap-1 ${
                    activeCamera?.id === cam.id
                      ? "bg-navy-900 text-white"
                      : "bg-navy-200/80 text-navy-700 hover:bg-navy-300"
                  }`}
                  title={`${cam.name} (${camIsSim ? "Simulated Test Stream" : "Physical Camera"})`}
                >
                  {camIsSim && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  <span>{cam.code}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main CCTV Viewport Panel */}
      <div className="relative aspect-video sm:aspect-[16/9] w-full bg-navy-950 overflow-hidden select-none">
        {/* Transformable Feed Canvas with Hardware-Accelerated PTZ Pan/Tilt/Zoom */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden"
          style={{
            transform: `scale(${viewportTransform.zoom}) translate(${viewportTransform.pan}%, ${viewportTransform.tilt}%)`,
            transformOrigin: "center center",
            transition: "transform 0.15s ease-out",
          }}
        >
          {/* RAW FOOTAGE: Native Video File (Simulated) or Raw Clean MJPEG (Physical) */}
          {streamMode === "raw" && activeCamera.status !== "OFFLINE" ? (
            isSimulated && computedVideoUrl ? (
              <video
                ref={videoRef}
                key={`central-raw-vid-${activeCamera.id}`}
                src={computedVideoUrl}
                autoPlay
                loop={isLooping}
                muted
                playsInline
                onLoadedData={() => {
                  setStreamOnline(true);
                  setVideoError(null);
                }}
                onError={() => {
                  setStreamOnline(false);
                  setVideoError("Unable to decode local video file stream.");
                }}
                className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
                  !videoError ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              />
            ) : (
              <img
                key={`central-raw-img-${activeCamera.id}-${activeCamera.streamUrl}-${streamRevision}`}
                src={`${api.getRawMjpegStreamUrl(activeCamera.id)}?v=${encodeURIComponent(activeCamera.streamUrl || "")}&rev=${streamRevision}`}
                alt={`Raw footage from ${activeCamera.name}`}
                className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
                  !videoError ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
                onError={() => {
                  setStreamOnline(false);
                  setVideoError(`Unable to connect to raw stream for ${activeCamera.name}.`);
                }}
                onLoad={() => {
                  setStreamOnline(true);
                  setVideoError(null);
                }}
              />
            )
          ) : (
            /* PIPELINE STREAM: Live MJPEG stream with AI bounding boxes & overlays */
            activeCamera.status !== "OFFLINE" && (
              <img
                key={`central-pipe-img-${activeCamera.id}-${activeCamera.streamUrl}-${thermalMode}-${nightVisionMode}-${streamRevision}`}
                src={`${api.getMjpegStreamUrl(activeCamera.id)}?v=${encodeURIComponent(activeCamera.streamUrl || "")}&rev=${streamRevision}`}
                alt={`Live pipeline stream from ${activeCamera.name}`}
                className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
                  !videoError ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
                onError={() => {
                  setStreamOnline(false);
                  setVideoError(`Unable to connect to MJPEG stream for ${activeCamera.name}.`);
                }}
                onLoad={() => {
                  setStreamOnline(true);
                  setVideoError(null);
                }}
              />
            )
          )}


          {/* DETECTIONS OVERLAY (Synchronously pans and zooms with camera view) */}
          {showOverlays && activeCamera.status !== "OFFLINE" && boundingBoxes.length > 0 && (
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
        </div>

        {/* Instant Snapshot Feedback Toast */}
        {snapshotFeedback && (
          <div className="absolute top-12 right-4 z-30 bg-navy-950/90 border border-sky-400 text-sky-200 px-3 py-1.5 rounded-lg shadow-xl text-xs font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
            <span>{snapshotFeedback}</span>
          </div>
        )}

        {/* CCTV Background Canvas (Fallback when stream offline or connecting) */}

        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            streamOnline || (activeCamera.status === "ACTIVE" && !videoError)
              ? "opacity-0 pointer-events-none"
              : thermalMode !== "off"
              ? "opacity-100 bg-gradient-to-tr from-slate-900 via-indigo-950 to-amber-950/40"
              : "opacity-100 bg-gradient-to-b from-navy-900 via-slate-900 to-navy-950"
          }`}
        >
          {/* Subtle surveillance grid texture */}
          <div
            className="absolute inset-0 opacity-[0.07] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          {/* Central subtle optical reticle / crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <div className="w-16 h-16 border border-white/60 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 border-t border-l border-white" />
            </div>
            <div className="absolute w-24 h-[1px] bg-white/40" />
            <div className="absolute h-24 w-[1px] bg-white/40" />
          </div>
        </div>

        {/* Offline / Error State Banner */}
        {activeCamera.status === "OFFLINE" || (!streamOnline && activeCamera.status !== "ACTIVE") || videoError ? (
          <div className="absolute inset-0 bg-navy-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6 z-20">
            <div className="w-12 h-12 rounded-xl bg-navy-900 border border-navy-700 flex items-center justify-center text-status-warn mb-3">
              <IconRadioWaves size={24} />
            </div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
              {videoError
                ? "VIDEO STREAM DECODE ERROR"
                : activeCamera.status === "OFFLINE"
                ? "TELEMETRY SIGNAL LOST"
                : isSimulated
                ? "STREAMING LOCAL TEST VIDEO"
                : "CONNECTING TO LIVE MJPEG STREAM"}
            </h3>
            <p className="text-xs text-navy-400 mt-1 max-w-sm font-mono">
              {videoError
                ? videoError
                : activeCamera.status === "OFFLINE"
                ? `Camera ${activeCamera.name} is stopped or offline.`
                : isSimulated
                ? `Reading local video feed from ${activeCamera.streamUrl || "local storage"}.`
                : `Receiving packet stream from ${activeCamera.ipAddress || activeCamera.name}.`}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {isSimulated ? (
                <>
                  <button
                    type="button"
                    onClick={handleQuickToggleStreaming}
                    disabled={isActionLoading}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isActionLoading ? (
                      <>
                        <IconRefresh size={13} className="animate-spin" />
                        <span>Starting Stream...</span>
                      </>
                    ) : (
                      <>
                        <IconPlay size={13} />
                        <span>Start Test Streaming</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTestModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 border border-navy-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Change Test Video File
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    setIsActionLoading(true);
                    try {
                      await api.startCamera({ camera_id: activeCamera.id });
                      await refreshCameras();
                    } catch (e: any) {
                      setVideoError(e?.message || "Failed to reconnect camera.");
                    } finally {
                      setIsActionLoading(false);
                    }
                  }}
                  disabled={isActionLoading}
                  className="px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-700 border border-navy-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <IconRefresh size={13} className={isActionLoading ? "animate-spin" : ""} />
                  <span>{isActionLoading ? "Reconnecting..." : "Retry Connection"}</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* TOP CCTV OVERLAY (Real-time telemetry & Simulated Camera Indicator) */}
        <div className="absolute top-0 left-0 right-0 p-3 sm:p-4 flex items-start justify-between pointer-events-none z-10 text-white text-[11px] sm:text-xs">
          {/* Top Left: Camera identity & post */}
          <div className="space-y-0.5 drop-shadow-md">
            <div className="flex items-center gap-2">
              <span className="font-bold font-mono text-white bg-black/60 px-2 py-0.5 rounded border border-white/20">
                {activeCamera.code}
              </span>
              <span className="text-navy-300 font-medium bg-black/50 px-1.5 py-0.5 rounded hidden sm:inline">
                {activeCamera.postNumber}
              </span>
              {isSimulated && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/90 text-navy-950 font-semibold border border-amber-300 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-navy-950 animate-pulse" />
                  TEST STREAM (SIMULATED)
                </span>
              )}
              {thermalMode !== "off" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/90 text-navy-950 font-semibold border border-amber-300 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                  THERMAL: {thermalMode.toUpperCase()} ({thermalInfo?.is_simulated ? "SIMULATED" : "RADIOMETRIC"})
                </span>
              )}
              {nightVisionMode !== "auto" && nightVisionMode !== "day" && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-700/90 text-white font-semibold border border-emerald-400 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  {nightVisionMode === "low_light_enhancement" ? "LOW LIGHT (CLAHE)" : "IR NIGHT FILTER"}
                </span>
              )}
              {(viewportTransform.zoom > 1.01 || Math.abs(viewportTransform.pan) > 0.5 || Math.abs(viewportTransform.tilt) > 0.5) && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/90 text-white font-semibold border border-blue-400 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-200 animate-pulse" />
                  PTZ: {viewportTransform.zoom.toFixed(1)}x [X:{viewportTransform.pan > 0 ? "+" : ""}{viewportTransform.pan.toFixed(0)}%, Y:{viewportTransform.tilt > 0 ? "+" : ""}{viewportTransform.tilt.toFixed(0)}%]
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-xs font-medium text-navy-300 bg-black/40 px-1 rounded inline-block mt-0.5">
              {activeCamera.sector}
            </p>
          </div>

          {/* Top Right: Live indicator, FPS, and live timestamp */}
          <div className="text-right space-y-1 drop-shadow-md">
            <div className="flex items-center justify-end gap-2">
              {activeCamera.status === "ALERT" ? (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-status-critical text-white text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-cctv-pulse" />
                  ALERT ACTIVE
                </span>
              ) : activeCamera.status === "ACTIVE" ? (
                <span
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-white text-[10px] font-semibold ${
                    isSimulated ? "bg-amber-600" : "bg-status-live"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-cctv-pulse" />
                  {isSimulated ? "SIMULATED FEED" : "LIVE"}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-navy-700 text-navy-300 text-[10px] font-semibold">
                  STOPPED / OFFLINE
                </span>
              )}
              <span className="bg-black/60 px-1.5 py-0.5 rounded border border-white/20 text-navy-300 font-mono text-[10px] font-medium">
                {activeCamera.fps} FPS
              </span>
            </div>
            <div className="text-white font-mono text-[11px] sm:text-xs font-medium bg-black/60 px-2 py-0.5 rounded border border-white/10 inline-block">
              {timestamp}
            </div>
          </div>
        </div>

        {/* Floating PTZ Controls Deck */}
        {showPtzPanel && activeCamera && (
          <div className="absolute top-12 right-3 z-30 shadow-2xl max-w-xs">
            <PTZControlPanel
              camera={activeCamera}
              onClose={() => setShowPtzPanel(false)}
              viewport={viewportTransform}
              onViewportChange={setViewportTransform}
            />
          </div>
        )}

        {/* BOTTOM CCTV OVERLAY (Controls and telemetry) */}
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 flex items-end justify-between pointer-events-none z-10 text-white text-[11px]">
          {/* Bottom Left: Coordinates, source info, and playback status */}
          <div className="bg-black/70 backdrop-blur-sm px-2.5 py-1.5 rounded border border-white/10 space-y-0.5">
            <div className="flex items-center gap-2 text-[10px] text-navy-300 flex-wrap font-medium">
              <span>RES: <span className="font-mono text-white">{activeCamera.resolution}</span></span>
              <span>•</span>
              <span>
                {isSimulated ? "SOURCE: LOCAL VIDEO FILE" : "ENC: H.264 / ONVIF"}
              </span>
              {isSimulated && (
                <>
                  <span>•</span>
                  <span className="text-amber-300 font-semibold">
                    LOOP: {isLooping ? "CONTINUOUS" : "ONCE"}
                  </span>
                </>
              )}
            </div>
            <div className="text-[10px] text-white font-medium">
              {isSimulated ? (
                <span>SIM-ENDPOINT: <span className="font-mono text-navy-300">{activeCamera.streamUrl?.split(/[\\/]/).pop() || "local_feed.mp4"}</span></span>
              ) : (
                <span>STATION: <span className="font-mono text-navy-300">{activeCamera.ipAddress}</span> [{streamOnline ? "STREAM: ONLINE" : "STREAM: CONNECTING"}]</span>
              )}
            </div>
          </div>

          {/* Bottom Right: Interactive Operator Toggles & Video Controls */}
          <div className="flex items-center gap-1.5 pointer-events-auto bg-black/70 backdrop-blur-sm p-1 rounded-lg border border-white/10">
            {/* Play, Pause, Stop controls for simulated CCTV feed */}
            {isSimulated && (
              <div className="flex items-center gap-1 border-r border-white/20 pr-1.5 mr-0.5">
                {isPlaying ? (
                  <button
                    onClick={handlePause}
                    className="p-1.5 rounded text-navy-300 hover:text-white hover:bg-white/10 transition-colors"
                    title="Pause Simulated Video Feed"
                    aria-label="Pause Simulated Video Feed"
                  >
                    <IconPause size={13} />
                  </button>
                ) : (
                  <button
                    onClick={handlePlay}
                    className="p-1.5 rounded text-emerald-400 hover:text-emerald-300 hover:bg-white/10 transition-colors"
                    title="Play Simulated Video Feed"
                    aria-label="Play Simulated Video Feed"
                  >
                    <IconPlay size={13} />
                  </button>
                )}

                <button
                  onClick={handleReplay}
                  className="p-1.5 rounded text-sky-400 hover:text-sky-300 hover:bg-white/10 transition-colors"
                  title="Replay Video from Beginning"
                  aria-label="Replay Video from Beginning"
                >
                  <IconRefresh size={13} />
                </button>

                <button
                  onClick={handleStop}
                  className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-white/10 transition-colors"
                  title="Stop Playback"
                  aria-label="Stop Playback"
                >
                  <IconSquare size={13} />
                </button>

                <button
                  onClick={handleToggleLoop}
                  className={`p-1.5 rounded transition-colors ${
                    isLooping ? "text-amber-400 bg-white/10" : "text-navy-400 hover:text-white"
                  }`}
                  title={isLooping ? "Looping Enabled (Continuous)" : "Looping Disabled"}
                  aria-label="Toggle Looping"
                >
                  <IconRepeat size={13} />
                </button>
              </div>
            )}

            {/* Virtual Fence Modal Toggle */}
            <button
              onClick={() => setShowFenceModal(true)}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                showFenceModal
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-800/80 text-emerald-200 hover:text-white hover:bg-emerald-700"
              }`}
              title="Virtual Fence & Tripwire Management"
            >
              <span>VIRTUAL FENCE</span>
            </button>

            {/* Instant Surveillance Snapshot Button */}
            <button
              onClick={handleCaptureSnapshot}
              disabled={isCapturingSnapshot}
              className="px-2 py-1 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 bg-sky-700 hover:bg-sky-600 text-white cursor-pointer disabled:opacity-50"
              title="Capture instantaneous forensic frame snapshot with SHA-256 integrity"
            >
              <IconCamera size={11} />
              <span>{isCapturingSnapshot ? "CAPTURING..." : "SNAPSHOT"}</span>
            </button>

            {/* PTZ Controller Toggle */}

            <button
              onClick={() => setShowPtzPanel((prev) => !prev)}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                showPtzPanel
                  ? "bg-amber-600 text-white"
                  : "bg-navy-800 text-navy-300 hover:text-white"
              }`}
              title="Toggle Pan-Tilt-Zoom Controller Deck"
            >
              <span>PTZ</span>
            </button>

            {/* Thermal Mode Selector */}
            <select
              value={thermalMode}
              onChange={(e) => handleSetThermalMode(e.target.value as any)}
              className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors outline-hidden border ${
                thermalMode !== "off"
                  ? "bg-amber-700 text-white border-amber-500"
                  : "bg-navy-800 text-navy-300 border-navy-700 hover:text-white"
              }`}
              title="Select Thermal Imaging Colormap"
            >
              <option value="off">OPTICAL (RGB)</option>
              <option value="ironbow">THERMAL: IRONBOW</option>
              <option value="rainbow">THERMAL: RAINBOW</option>
              <option value="white_hot">THERMAL: WHITE-HOT</option>
              <option value="black_hot">THERMAL: BLACK-HOT</option>
            </select>

            {/* Night Vision Mode Selector */}
            <select
              value={nightVisionMode}
              onChange={(e) => handleSetNightVisionMode(e.target.value as any)}
              className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors outline-hidden border ${
                nightVisionMode !== "auto" && nightVisionMode !== "day"
                  ? "bg-emerald-800 text-white border-emerald-600"
                  : "bg-navy-800 text-navy-300 border-navy-700 hover:text-white"
              }`}
              title="Select Day/Night IR Filter & Low-Light Enhancement"
            >
              <option value="auto">NV: AUTO IR</option>
              <option value="day">NV: FORCED DAY</option>
              <option value="night">NV: IR NIGHT</option>
              <option value="low_light_enhancement">NV: LOW-LIGHT (CLAHE)</option>
            </select>

            {/* Stream Mode Switcher (Raw Footage vs AI Pipeline Stream) */}
            <button
              onClick={toggleStreamMode}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                streamMode === "pipeline"
                  ? "bg-indigo-700 text-white"
                  : "bg-amber-600 text-white"
              }`}
              title="Toggle between backend AI pipeline stream and raw video footage"
            >
              <IconFilm size={11} />
              <span>{streamMode === "pipeline" ? "PIPELINE STREAM" : "RAW FOOTAGE"}</span>
            </button>

            <button
              onClick={() => setShowOverlays((prev) => !prev)}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                showOverlays
                  ? "bg-navy-700 text-white"
                  : "bg-navy-900 text-navy-400 hover:text-white"
              }`}
              title="Toggle AI Detection Overlays"
            >
              {showOverlays ? "AI BOXES: ON" : "AI BOXES: OFF"}
            </button>
          </div>
        </div>
      </div>

      <TestStreamingModal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        onStreamStarted={() => {
          refreshCameras();
          setShowTestModal(false);
        }}
        onStreamStopped={() => {
          refreshCameras();
          setShowTestModal(false);
        }}
        cameras={cameraList}
        selectedCameraId={activeCamera.id}
      />

      {showFenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm">
          <div className="w-full max-w-6xl h-[88vh] rounded-2xl overflow-hidden shadow-2xl border border-navy-700">
            <VirtualFenceManager
              cameras={cameraList}
              initialCameraId={activeCamera.id}
              onClose={() => setShowFenceModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
