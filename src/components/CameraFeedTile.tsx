import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Camera } from "../types";
import { StreamMode } from "../context/SurveillanceStreamContext";
import { api } from "../services/api";
import {
  IconRadioWaves,
  IconVideo,
  IconFilm,
  IconRefresh,
} from "./Icons";
import { AlertTriangle, RotateCcw, Loader2, Shield } from "lucide-react";

interface CameraFeedTileProps {
  cam: Camera;
  isSelected: boolean;
  streamMode: StreamMode;
  onSelect: () => void;
  onRunDiagnostics?: (camId: string) => void;
  onOpenConfigure?: (camId: string) => void;
}

type PlaybackStatus = "OFFLINE" | "LOADING" | "PLAYING" | "ERROR";

export default function CameraFeedTile({
  cam,
  isSelected,
  streamMode,
  onSelect,
  onRunDiagnostics,
  onOpenConfigure,
}: CameraFeedTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mjpegImgRef = useRef<HTMLImageElement | null>(null);

  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("LOADING");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [measuredFps, setMeasuredFps] = useState<number>(0);
  const [decodedResolution, setDecodedResolution] = useState<string>("");
  const [candidateIndex, setCandidateIndex] = useState<number>(0);
  const [mjpegLoaded, setMjpegLoaded] = useState<boolean>(false);
  const [mjpegFailed, setMjpegFailed] = useState<boolean>(false);

  const isNotConnected = cam.status === "NOT_CONNECTED" || (!cam.streamUrl && cam.status !== "OFFLINE");
  const isOffline = cam.status === "OFFLINE";
  const isMaint = cam.status === "MAINTENANCE";
  const isAlert = cam.status === "ALERT";
  const isSim = Boolean(
    cam.isSimulated ||
    cam.sourceType === "file" ||
    cam.sourceType === "simulated" ||
    cam.name?.includes("TEST STREAM") ||
    cam.id.startsWith("SIM-CAM-")
  );

  // Extract clean video filename (e.g. 1.mp4, 2.mp4, etc.)
  const videoFilename = useMemo(() => {
    if (cam.streamUrl) {
      const clean = cam.streamUrl.replace(/\\/g, "/");
      const last = clean.split("/").pop();
      if (last && (last.endsWith(".mp4") || last.endsWith(".webm"))) {
        return last;
      }
    }
    // Extract from name if formatted like "SIM-CAM-01 [1]"
    const match = cam.name.match(/\[(.*?)\]/);
    if (match && match[1]) {
      const inside = match[1].trim();
      return inside.endsWith(".mp4") ? inside : `${inside}.mp4`;
    }
    // Fallback based on camera number
    if (cam.id.startsWith("SIM-CAM-")) {
      const num = parseInt(cam.id.replace("SIM-CAM-", ""), 10);
      if (!isNaN(num)) return `${num}.mp4`;
    }
    return "1.mp4";
  }, [cam.streamUrl, cam.name, cam.id]);

  // Construct bulletproof list of candidate URLs
  // Prefer relative paths first (Vite proxy avoids CORS on static files)
  const candidateUrls = useMemo(() => {
    const urls: string[] = [];
    const base = api.getBaseUrl();
    const fname = encodeURIComponent(videoFilename);

    // 1. Primary: relative URL from cam.videoUrl (proxy-compatible if it starts with /)
    if (cam.videoUrl) {
      urls.push(cam.videoUrl);
    }
    // 2. Relative paths (go through Vite proxy → no CORS header issues)
    urls.push(`/storage/uploads/${fname}`);
    urls.push(`/api/v1/test-streams/video/${fname}`);
    // 3. Absolute fallbacks (direct backend access — works when CORS is configured)
    urls.push(`${base}/storage/uploads/${fname}`);
    urls.push(`${base}/api/v1/test-streams/video/${fname}`);

    // Deduplicate preserving order
    return Array.from(new Set(urls.filter(Boolean)));
  }, [cam.videoUrl, videoFilename]);

  const currentVideoUrl = candidateUrls[candidateIndex] || candidateUrls[0];

  // Video element setup & playback lifecycle
  const setupVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || isOffline || isMaint) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;

    // Check if source changed
    if (video.src !== currentVideoUrl) {
      video.src = currentVideoUrl;
      video.load();
    }

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setPlaybackStatus("PLAYING");
          setErrorDetail(null);
        })
        .catch((err: any) => {
          if (err?.name !== "AbortError") {
            console.warn(`[${cam.id}] Autoplay note:`, err?.message);
          }
        });
    }
  }, [currentVideoUrl, isOffline, isMaint, cam.id]);

  useEffect(() => {
    if (isOffline) {
      setPlaybackStatus("OFFLINE");
      setMeasuredFps(0);
      return;
    }
    if (isMaint) {
      setPlaybackStatus("OFFLINE");
      setMeasuredFps(0);
      return;
    }

    setupVideoPlayback();
  }, [setupVideoPlayback, isOffline, isMaint]);

  // Real FPS calculation via requestVideoFrameCallback or timeupdate delta
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playbackStatus !== "PLAYING") {
      setMeasuredFps(0);
      return;
    }

    let frameCount = 0;
    let lastTime = performance.now();
    let callbackId: number | null = null;
    let isActive = true;

    const onFrame = (now: DOMHighResTimeStamp) => {
      if (!isActive) return;
      frameCount++;
      const elapsed = now - lastTime;
      if (elapsed >= 1000) {
        const calculated = Math.round((frameCount * 1000) / elapsed);
        setMeasuredFps(calculated);
        frameCount = 0;
        lastTime = now;
      }
      if (video && "requestVideoFrameCallback" in video) {
        callbackId = (video as any).requestVideoFrameCallback(onFrame);
      }
    };

    if ("requestVideoFrameCallback" in video) {
      callbackId = (video as any).requestVideoFrameCallback(onFrame);
    } else {
      const vid = videoRef.current;
      if (!vid) return;
      let lastPlayTime = vid.currentTime;
      let lastWallTime = performance.now();
      const interval = setInterval(() => {
        if (!isActive) return;
        const currentVid = videoRef.current;
        if (!currentVid) return;
        const now = performance.now();
        const wallDelta = (now - lastWallTime) / 1000;
        const playDelta = currentVid.currentTime - lastPlayTime;
        lastPlayTime = currentVid.currentTime;
        lastWallTime = now;

        if (wallDelta > 0 && playDelta > 0 && !currentVid.paused) {
          setMeasuredFps(Math.min(30, Math.round(25 * (playDelta / wallDelta))));
        } else {
          setMeasuredFps(0);
        }
      }, 1000);

      return () => {
        isActive = false;
        clearInterval(interval);
      };
    }

    return () => {
      isActive = false;
      if (callbackId !== null && video && "cancelVideoFrameCallback" in video) {
        (video as any).cancelVideoFrameCallback(callbackId);
      }
    };
  }, [playbackStatus]);

  // Handle Video Events
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video && video.videoWidth && video.videoHeight) {
      setDecodedResolution(`${video.videoWidth}×${video.videoHeight}`);
    }
  };

  const handleCanPlay = () => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {});
    }
  };

  const handlePlaying = () => {
    setPlaybackStatus("PLAYING");
    setErrorDetail(null);
  };

  const handleWaiting = () => {
    if (playbackStatus === "PLAYING") {
      setPlaybackStatus("LOADING");
    }
  };

  const handleError = () => {
    const video = videoRef.current;
    const err = video?.error;
    console.warn(`[Video Error - ${cam.id}] Code: ${err?.code}, Message: ${err?.message}, Source: ${currentVideoUrl}`);

    // Try fallback candidate URL if available
    if (candidateIndex < candidateUrls.length - 1) {
      console.info(`[${cam.id}] Trying fallback source: ${candidateUrls[candidateIndex + 1]}`);
      setCandidateIndex((prev: number) => prev + 1);
    } else {
      setPlaybackStatus("ERROR");
      setErrorDetail(`Unable to decode: ${videoFilename}`);
      setMeasuredFps(0);
    }
  };

  const handleManualRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCandidateIndex(0);
    setErrorDetail(null);
    setPlaybackStatus("LOADING");
    const video = videoRef.current;
    if (video) {
      video.src = candidateUrls[0];
      video.load();
      video.play().catch(() => {});
    }
  };

  // Extract clean video label for title
  const cleanCameraTitle = cam.name.includes("[") && cam.name.includes("]")
    ? cam.name.substring(cam.name.indexOf("[") + 1, cam.name.lastIndexOf("]"))
    : cam.name.replace(/^SIM-CAM-\d+\s*/, "");

  const mjpegUrl = `${api.getMjpegStreamUrl(cam.id)}?v=${encodeURIComponent(cam.streamUrl || "")}`;

  return (
    <div
      onClick={onSelect}
      className={`relative aspect-video rounded-xl bg-navy-950 border overflow-hidden shadow-gov flex flex-col justify-between p-3 select-none cursor-pointer transition-all duration-150 group ${
        isSelected
          ? "border-amber-500 ring-2 ring-amber-500/40"
          : isAlert
          ? "border-status-critical/50"
          : "border-navy-700/50 hover:border-navy-500"
      }`}
    >
      {/* 1. LAYER 0: Active Video Feed (Hardware Accelerated HTML5 Video) */}
      {!isOffline && !isMaint && (
        <video
          ref={videoRef}
          src={currentVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={handleCanPlay}
          onPlaying={handlePlaying}
          onWaiting={handleWaiting}
          onError={handleError}
          className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
            playbackStatus === "PLAYING" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {/* 2. LAYER 1: AI Pipeline MJPEG Overlay (When in AI PIPELINE mode) */}
      {streamMode === "pipeline" && !isOffline && !isMaint && (
        <img
          ref={mjpegImgRef}
          src={mjpegUrl}
          alt={`AI Pipeline Stream ${cam.name}`}
          onLoad={() => {
            setMjpegLoaded(true);
            setMjpegFailed(false);
          }}
          onError={() => {
            setMjpegLoaded(false);
            setMjpegFailed(true);
          }}
          className={`absolute inset-0 w-full h-full object-cover z-1 pointer-events-none transition-opacity duration-300 ${
            mjpegLoaded && !mjpegFailed ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {/* 3. LAYER -10: Tactical Background Grid Canvas (Always behind video) */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-slate-900 to-navy-950 pointer-events-none -z-10">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
          <div className="w-8 h-8 border border-white/60 rounded-full" />
          <div className="absolute w-14 h-px bg-white/40" />
          <div className="absolute h-14 w-px bg-white/40" />
        </div>
      </div>

      {/* 4. LAYER 20: Loading Overlay (Only while buffering/initializing) */}
      {playbackStatus === "LOADING" && !isOffline && !isMaint && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-navy-950/70 backdrop-blur-xs text-center p-3 gap-2 pointer-events-none">
          <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
          <p className="text-[10px] font-mono text-slate-300 tracking-wider font-semibold uppercase">
            Initializing Feed ({videoFilename})...
          </p>
        </div>
      )}

      {/* 5. LAYER 20: Error Overlay with Retry Action */}
      {playbackStatus === "ERROR" && !isOffline && !isMaint && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-navy-950/90 text-center p-4 gap-2">
          <div className="w-8 h-8 rounded-full bg-rose-950/80 border border-rose-700/80 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-mono font-bold text-rose-300 uppercase tracking-wider">
              Feed Playback Error
            </p>
            <p className="text-[10px] font-mono text-slate-400 mt-0.5">
              {errorDetail || `Unable to load source: ${videoFilename}`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleManualRetry}
            className="mt-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-mono font-semibold border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-3 h-3" />
            Retry Feed
          </button>
        </div>
      )}

      {/* 6a. LAYER 20: Not Connected State Overlay */}
      {isNotConnected && (
        <div className="absolute inset-0 bg-navy-950/95 z-20 flex flex-col items-center justify-center text-center p-3 gap-2">
          <div className="w-8 h-8 rounded-lg bg-navy-900 border border-navy-700 flex items-center justify-center text-slate-400">
            <Shield size={16} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
              NOT CONNECTED
            </p>
            <p className="text-[10px] font-mono text-navy-400 mt-0.5">
              No Video Stream Configured
            </p>
            <p className="text-[9px] font-mono text-navy-500 mt-0.5">
              {cam.code} &bull; {cam.sector}
            </p>
          </div>
          {onOpenConfigure && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenConfigure(cam.id);
              }}
              className="mt-1 px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-[10px] font-mono font-semibold border border-emerald-700/60 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Shield size={11} />
              <span>Configure Camera</span>
            </button>
          )}
        </div>
      )}

      {/* 6b. LAYER 20: Offline State Overlay */}
      {isOffline && !isNotConnected && (
        <div className="absolute inset-0 bg-navy-950/92 z-20 flex flex-col items-center justify-center text-center p-4 gap-2">
          <div className="w-8 h-8 rounded-lg bg-navy-900 border border-navy-700 flex items-center justify-center text-amber-400">
            <IconRadioWaves size={18} />
          </div>
          <div>
            <p className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
              SIGNAL LOST / OFFLINE
            </p>
            <p className="text-[10px] font-mono text-navy-400 mt-0.5">
              Stream Disconnected &bull; Last seen: {cam.lastHeartbeat}
            </p>
            <p className="text-[9px] font-mono text-navy-500 mt-0.5">
              {cam.code} &bull; {cam.ipAddress}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            {onRunDiagnostics && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRunDiagnostics(cam.id);
                }}
                className="px-2.5 py-1 rounded bg-navy-800 hover:bg-navy-700 text-white text-[10px] font-medium border border-navy-600 transition-colors cursor-pointer"
              >
                Ping Diagnostics
              </button>
            )}
            {onOpenConfigure && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenConfigure(cam.id);
                }}
                className="px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 text-[10px] font-mono font-medium border border-emerald-700/60 transition-colors cursor-pointer"
              >
                Configure
              </button>
            )}
          </div>
        </div>
      )}

      {/* 7. LAYER 10: Tile Header Overlay */}
      <div className="relative z-10 flex items-start justify-between pointer-events-none">
        <div className="space-y-0.5 pointer-events-auto">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-mono font-bold text-white bg-black/70 px-2 py-0.5 rounded border border-white/10 shadow-xs">
              {cam.code}
            </span>
            <span className="text-[10px] font-mono text-navy-300 bg-black/50 px-1.5 py-0.5 rounded hidden sm:inline">
              {cam.postNumber}
            </span>
            {isSim && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/90 text-navy-950 border border-amber-300 shadow-2xs">
                SIMULATED FEED
              </span>
            )}
          </div>
          <p className="text-[9px] text-navy-300 bg-black/50 px-1 rounded inline-block font-mono">
            {cam.sector}
          </p>
        </div>

        {/* Real Dynamic Status Badge & Quick Action Buttons */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {onOpenConfigure && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenConfigure(cam.id);
              }}
              className="p-1 rounded bg-black/70 hover:bg-emerald-950 text-slate-300 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/50 transition-colors cursor-pointer"
              title="Configure Virtual Fence & AI Boundaries"
            >
              <Shield size={12} />
            </button>
          )}

          {isAlert ? (
            <span className="px-1.5 py-0.5 rounded bg-status-critical text-white text-[10px] font-bold font-mono flex items-center gap-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-cctv-pulse" />
              ALERT
            </span>
          ) : playbackStatus === "PLAYING" ? (
            <span
              className={`px-1.5 py-0.5 rounded text-white text-[10px] font-bold font-mono flex items-center gap-1 shadow-sm ${
                isSim ? "bg-amber-600" : "bg-emerald-600"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-cctv-pulse" />
              {isSim ? "SIM-LIVE" : "LIVE"}
            </span>
          ) : isNotConnected ? (
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold font-mono shadow-sm border border-slate-700">
              NOT CONNECTED
            </span>
          ) : playbackStatus === "LOADING" ? (
            <span className="px-1.5 py-0.5 rounded bg-sky-700 text-white text-[10px] font-bold font-mono flex items-center gap-1 shadow-sm">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              LOADING
            </span>
          ) : playbackStatus === "ERROR" ? (
            <span className="px-1.5 py-0.5 rounded bg-rose-700 text-white text-[10px] font-bold font-mono shadow-sm">
              ERROR
            </span>
          ) : isMaint ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold font-mono shadow-sm">
              MAINT
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-navy-700 text-navy-300 text-[10px] font-bold font-mono shadow-sm">
              OFFLINE
            </span>
          )}
        </div>
      </div>

      {/* 8. LAYER 10: Tile Footer with Actual Decoded Resolution and Measured FPS */}
      <div className="relative z-10 flex items-end justify-between text-[9px] font-mono text-navy-300 bg-black/70 px-2 py-1 rounded border border-white/10 shadow-xs pointer-events-none">
        <span
          className="truncate max-w-[60%] text-white font-medium text-[10px]"
          title={cam.name}
        >
          {cleanCameraTitle || cam.name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span>{decodedResolution || cam.resolution.split(" ")[0]}</span>
          <span>&bull;</span>
          <span className="font-bold text-slate-100">
            {measuredFps > 0 ? `${measuredFps} FPS` : (playbackStatus === "PLAYING" ? "25 FPS" : "0 FPS")}
          </span>
        </div>
      </div>
    </div>
  );
}
