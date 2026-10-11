import React, { useState, useEffect, useRef } from "react";
import { Camera, PtzCapabilitiesResponse, PtzPreset } from "../types";
import { api } from "../services/api";

export interface ViewportTransform {
  pan: number;  // percentage offset (-50 to 50)
  tilt: number; // percentage offset (-50 to 50)
  zoom: number; // scale multiplier (1.0 to 4.0)
}

interface PTZControlPanelProps {
  camera: Camera;
  onClose?: () => void;
  isEmbedded?: boolean;
  viewport?: ViewportTransform;
  onViewportChange?: (viewport: ViewportTransform) => void;
}

// Default simulated preset coordinate coordinates
const DEFAULT_PRESET_COORDS: Record<string, ViewportTransform> = {
  PRESET_SIM_1: { pan: 18, tilt: -10, zoom: 1.8 },
  PRESET_SIM_2: { pan: -22, tilt: 14, zoom: 2.4 },
  PRESET_SIM_3: { pan: 28, tilt: 20, zoom: 1.5 },
};

export default function PTZControlPanel({
  camera,
  onClose,
  isEmbedded = false,
  viewport: externalViewport,
  onViewportChange,
}: PTZControlPanelProps) {
  const [capabilities, setCapabilities] = useState<PtzCapabilitiesResponse | null>(null);
  const [loadingCaps, setLoadingCaps] = useState(true);
  const [speed, setSpeed] = useState<number>(0.6);
  const [activeVector, setActiveVector] = useState<{ pan: number; tilt: number; zoom?: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [presets, setPresets] = useState<PtzPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [isSavingPreset, setIsSavingPreset] = useState<boolean>(false);
  const [customPresetMap, setCustomPresetMap] = useState<Record<string, ViewportTransform>>(DEFAULT_PRESET_COORDS);

  // Local viewport state if external is not supplied
  const [localViewport, setLocalViewport] = useState<ViewportTransform>({
    pan: 0,
    tilt: 0,
    zoom: 1.0,
  });

  const currentVp = externalViewport ?? localViewport;
  const vpRef = useRef(currentVp);
  vpRef.current = currentVp;

  const moveIntervalRef = useRef<any>(null);

  // Sync viewport changes upward
  const applyViewportChange = (updater: (prev: ViewportTransform) => ViewportTransform) => {
    const next = updater(vpRef.current);
    const clamped: ViewportTransform = {
      pan: Math.max(-50, Math.min(50, next.pan)),
      tilt: Math.max(-50, Math.min(50, next.tilt)),
      zoom: Math.max(1.0, Math.min(4.0, next.zoom)),
    };
    if (onViewportChange) {
      onViewportChange(clamped);
    } else {
      setLocalViewport(clamped);
    }
    return clamped;
  };

  // Load capabilities & presets
  useEffect(() => {
    let isMounted = true;
    async function loadPtzData() {
      setLoadingCaps(true);
      try {
        const [capsRes, presetsRes] = await Promise.allSettled([
          api.getPtzCapabilities(camera.id),
          api.getPtzPresets(camera.id),
        ]);
        if (!isMounted) return;

        if (capsRes.status === "fulfilled" && capsRes.value) {
          setCapabilities(capsRes.value);
        }
        if (presetsRes.status === "fulfilled" && presetsRes.value) {
          setPresets(presetsRes.value);
          if (presetsRes.value.length > 0) {
            setSelectedPreset(presetsRes.value[0].token);
          }
        }
      } catch (err) {
        console.warn("Error loading PTZ data:", err);
      } finally {
        if (isMounted) setLoadingCaps(false);
      }
    }

    loadPtzData();
    return () => {
      isMounted = false;
      if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
    };
  }, [camera.id]);

  const stepViewport = (pan: number, tilt: number, zoom: number) => {
    applyViewportChange((prev) => {
      // Delta scales with speed
      const panStep = pan * (3.5 * speed);
      const tiltStep = tilt * (3.5 * speed);
      const zoomStep = zoom * (0.12 * speed);

      const nextZoom = Math.max(1.0, Math.min(4.0, prev.zoom + zoomStep));
      // Pan/tilt bounds expand slightly when zoomed in
      const nextPan = prev.pan + panStep;
      const nextTilt = prev.tilt + tiltStep;

      return {
        pan: nextPan,
        tilt: nextTilt,
        zoom: nextZoom,
      };
    });
  };

  const handleStartMove = (pan: number, tilt: number, zoom: number = 0) => {
    setActiveVector({ pan, tilt, zoom });

    // Step immediately once on click/down
    stepViewport(pan, tilt, zoom);

    setStatusMessage(
      zoom !== 0
        ? zoom > 0
          ? `Zooming In (${vpRef.current.zoom.toFixed(1)}x)`
          : `Zooming Out (${vpRef.current.zoom.toFixed(1)}x)`
        : `Panning [X: ${vpRef.current.pan.toFixed(0)}%, Y: ${vpRef.current.tilt.toFixed(0)}%]`
    );

    // Continuous loop while mouse or touch is held down
    if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
    moveIntervalRef.current = setInterval(() => {
      stepViewport(pan, tilt, zoom);
      setStatusMessage(
        zoom !== 0
          ? zoom > 0
            ? `Zooming In (${vpRef.current.zoom.toFixed(1)}x)`
            : `Zooming Out (${vpRef.current.zoom.toFixed(1)}x)`
          : `Panning [X: ${vpRef.current.pan.toFixed(0)}%, Y: ${vpRef.current.tilt.toFixed(0)}%]`
      );
    }, 60);

    // Also dispatch to backend asynchronously
    api.ptzContinuousMove(camera.id, { pan, tilt, zoom, speed }).catch(() => {});
  };

  const handleStopMove = () => {
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
    setActiveVector(null);
    setStatusMessage("Position Locked");
    api.ptzStop(camera.id).catch(() => {});
  };

  const handleResetView = () => {
    if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
    applyViewportChange(() => ({ pan: 0, tilt: 0, zoom: 1.0 }));
    setStatusMessage("Viewport Reset to Standard 1.0x Normal View");
    api.ptzStop(camera.id).catch(() => {});
  };

  const handleGotoPreset = async () => {
    if (!selectedPreset) return;
    setStatusMessage(`Navigating to preset [${selectedPreset}]...`);

    // Check if we have coordinate mapping
    const mapped = customPresetMap[selectedPreset];
    if (mapped) {
      applyViewportChange(() => ({ ...mapped }));
    } else {
      // Default fallback coordinates based on token
      if (selectedPreset.includes("1") || selectedPreset.toLowerCase().includes("gate")) {
        applyViewportChange(() => ({ pan: 18, tilt: -10, zoom: 1.8 }));
      } else if (selectedPreset.includes("2") || selectedPreset.toLowerCase().includes("lane")) {
        applyViewportChange(() => ({ pan: -22, tilt: 14, zoom: 2.4 }));
      } else if (selectedPreset.includes("3") || selectedPreset.toLowerCase().includes("wall")) {
        applyViewportChange(() => ({ pan: 28, tilt: 20, zoom: 1.5 }));
      } else {
        applyViewportChange(() => ({ pan: 0, tilt: 0, zoom: 1.0 }));
      }
    }

    try {
      const res = await api.gotoPtzPreset(camera.id, selectedPreset);
      setStatusMessage(res.message || `Arrived at preset ${selectedPreset}`);
    } catch {
      setStatusMessage("Arrived at simulated preset coordinates");
    }
  };

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;
    setIsSavingPreset(true);
    const token = `PRESET_${Date.now()}`;
    const name = newPresetName.trim();

    // Save current coordinates in custom map
    setCustomPresetMap((prev) => ({
      ...prev,
      [token]: { ...vpRef.current },
    }));

    try {
      const res = await api.createPtzPreset(camera.id, name);
      setStatusMessage(res.message || `Preset '${name}' created`);
      setNewPresetName("");

      // Refresh presets list
      const updated = await api.getPtzPresets(camera.id);
      if (updated && updated.length > 0) {
        setPresets(updated);
        setSelectedPreset(updated[updated.length - 1].token);
      } else {
        setPresets((prev) => [...prev, { token, name }]);
        setSelectedPreset(token);
      }
    } catch {
      // Local fallback
      setPresets((prev) => [...prev, { token, name }]);
      setSelectedPreset(token);
      setStatusMessage(`Saved local preset '${name}' at current viewport`);
      setNewPresetName("");
    } finally {
      setIsSavingPreset(false);
    }
  };

  const isSimulated = Boolean(
    capabilities?.is_simulated_viewport ||
    camera.isSimulated ||
    camera.sourceType === "file" ||
    camera.sourceType === "simulated" ||
    camera.name?.includes("TEST STREAM")
  );

  return (
    <div
      className={`bg-navy-950/95 border border-navy-700/80 backdrop-blur-md rounded-xl text-white font-mono shadow-2xl flex flex-col select-none ${
        isEmbedded ? "w-full p-4" : "w-80 p-4"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-navy-800 pb-2.5 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy-100 flex items-center gap-2">
              <span>PTZ Control Deck</span>
              <span className="text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded">
                {currentVp.zoom.toFixed(1)}x ZOOM
              </span>
            </h3>
            <span className="text-[10px] text-navy-400">
              {camera.code} • {camera.name}
            </span>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-navy-400 hover:text-white hover:bg-navy-800 transition-colors cursor-pointer"
            title="Close PTZ Panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Mode / Capability Banner */}
      <div className="mb-2.5">
        {loadingCaps ? (
          <div className="px-2.5 py-1 rounded bg-navy-900 text-[10px] text-navy-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-navy-400 border-t-white animate-spin" />
            <span>Probing ONVIF PTZ service...</span>
          </div>
        ) : isSimulated ? (
          <div className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 border border-amber-600/40 text-[10px] text-amber-200">
            <div className="flex items-center justify-between font-bold text-amber-400">
              <span className="flex items-center gap-1">
                <span>●</span>
                <span>DIGITAL VIEWPORT PTZ</span>
              </span>
              <span className="text-[9px] text-amber-300 font-mono">
                X:{currentVp.pan.toFixed(0)}% Y:{currentVp.tilt.toFixed(0)}%
              </span>
            </div>
            <p className="text-[9px] text-amber-300/80 mt-0.5">
              Live Pan-Tilt-Zoom viewport active on video stream.
            </p>
          </div>
        ) : capabilities?.ptz_supported ? (
          <div className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-[10px] text-emerald-300 flex items-center justify-between">
            <span className="font-bold">ONVIF PROFILE S HARDWARE</span>
            <span className="text-[9px] text-emerald-400">ONLINE</span>
          </div>
        ) : (
          <div className="px-2.5 py-1 rounded-lg bg-navy-900 border border-navy-700 text-[10px] text-navy-400 flex items-center justify-between">
            <span>Software Digital PTZ Active</span>
            <span className="text-amber-400 font-bold">{currentVp.zoom.toFixed(1)}x</span>
          </div>
        )}
      </div>

      {/* Directional Pad (Compass) */}
      <div className="flex flex-col items-center justify-center my-1 select-none">
        <div className="grid grid-cols-3 gap-1.5 w-44">
          {/* Top-Left */}
          <button
            type="button"
            onMouseDown={() => handleStartMove(0.7, 0.7)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(0.7, 0.7)}
            onTouchEnd={handleStopMove}
            className="p-2.5 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-amber-600 border border-navy-700 text-xs text-navy-200 hover:text-white transition-colors cursor-pointer flex items-center justify-center shadow-xs"
            title="Pan Left / Tilt Up"
          >
            ↖
          </button>

          {/* Up (Tilt Up) */}
          <button
            type="button"
            onMouseDown={() => handleStartMove(0, 1.0)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(0, 1.0)}
            onTouchEnd={handleStopMove}
            className={`p-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center shadow-xs ${
              activeVector?.tilt && activeVector.tilt > 0
                ? "bg-amber-600 text-white border-amber-400"
                : "bg-navy-900 hover:bg-navy-800 border-navy-700 text-navy-100 hover:text-white"
            }`}
            title="Tilt Up"
          >
            ▲
          </button>

          {/* Top-Right */}
          <button
            type="button"
            onMouseDown={() => handleStartMove(-0.7, 0.7)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(-0.7, 0.7)}
            onTouchEnd={handleStopMove}
            className="p-2.5 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-amber-600 border border-navy-700 text-xs text-navy-200 hover:text-white transition-colors cursor-pointer flex items-center justify-center shadow-xs"
            title="Pan Right / Tilt Up"
          >
            ↗
          </button>

          {/* Left (Pan Left) */}
          <button
            type="button"
            onMouseDown={() => handleStartMove(1.0, 0)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(1.0, 0)}
            onTouchEnd={handleStopMove}
            className={`p-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center shadow-xs ${
              activeVector?.pan && activeVector.pan > 0
                ? "bg-amber-600 text-white border-amber-400"
                : "bg-navy-900 hover:bg-navy-800 border-navy-700 text-navy-100 hover:text-white"
            }`}
            title="Pan Left"
          >
            ◀
          </button>

          {/* Center: Immediate STOP / Lock Button */}
          <button
            type="button"
            onClick={handleStopMove}
            className="p-2.5 rounded-lg bg-rose-900/90 hover:bg-rose-800 active:bg-rose-700 border border-rose-500/60 text-xs font-extrabold text-white transition-colors cursor-pointer flex items-center justify-center shadow-xs"
            title="Halt Movement (Lock Orientation)"
          >
            ■ STOP
          </button>

          {/* Right (Pan Right) */}
          <button
            type="button"
            onMouseDown={() => handleStartMove(-1.0, 0)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(-1.0, 0)}
            onTouchEnd={handleStopMove}
            className={`p-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center shadow-xs ${
              activeVector?.pan && activeVector.pan < 0
                ? "bg-amber-600 text-white border-amber-400"
                : "bg-navy-900 hover:bg-navy-800 border-navy-700 text-navy-100 hover:text-white"
            }`}
            title="Pan Right"
          >
            ▶
          </button>

          {/* Bottom-Left */}
          <button
            type="button"
            onMouseDown={() => handleStartMove(0.7, -0.7)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(0.7, -0.7)}
            onTouchEnd={handleStopMove}
            className="p-2.5 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-amber-600 border border-navy-700 text-xs text-navy-200 hover:text-white transition-colors cursor-pointer flex items-center justify-center shadow-xs"
            title="Pan Left / Tilt Down"
          >
            ↙
          </button>

          {/* Down (Tilt Down) */}
          <button
            type="button"
            onMouseDown={() => handleStartMove(0, -1.0)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(0, -1.0)}
            onTouchEnd={handleStopMove}
            className={`p-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center shadow-xs ${
              activeVector?.tilt && activeVector.tilt < 0
                ? "bg-amber-600 text-white border-amber-400"
                : "bg-navy-900 hover:bg-navy-800 border-navy-700 text-navy-100 hover:text-white"
            }`}
            title="Tilt Down"
          >
            ▼
          </button>

          {/* Bottom-Right */}
          <button
            type="button"
            onMouseDown={() => handleStartMove(-0.7, -0.7)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(-0.7, -0.7)}
            onTouchEnd={handleStopMove}
            className="p-2.5 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-amber-600 border border-navy-700 text-xs text-navy-200 hover:text-white transition-colors cursor-pointer flex items-center justify-center shadow-xs"
            title="Pan Right / Tilt Down"
          >
            ↘
          </button>
        </div>

        {/* Quick Reset Center Button */}
        <button
          type="button"
          onClick={handleResetView}
          className="mt-2 px-3 py-1 rounded bg-navy-900 hover:bg-navy-800 active:bg-navy-700 text-[10px] text-navy-300 hover:text-white border border-navy-700 transition-colors cursor-pointer flex items-center gap-1.5"
          title="Reset to 1.0x Normal Center View"
        >
          <span>⟲</span>
          <span>Center / Reset View (1.0x)</span>
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="mt-2.5 pt-2 border-t border-navy-800/80 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-navy-400 font-semibold">DIGITAL / OPTICAL ZOOM</span>
          <span className="text-amber-400 text-[10px] font-bold">
            {currentVp.zoom.toFixed(1)}x / 4.0x
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onMouseDown={() => handleStartMove(0, 0, 1.0)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(0, 0, 1.0)}
            onTouchEnd={handleStopMove}
            className="py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-emerald-600 border border-navy-700 text-xs font-bold text-emerald-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
          >
            <span>+</span>
            <span>ZOOM IN</span>
          </button>

          <button
            type="button"
            onMouseDown={() => handleStartMove(0, 0, -1.0)}
            onMouseUp={handleStopMove}
            onMouseLeave={handleStopMove}
            onTouchStart={() => handleStartMove(0, 0, -1.0)}
            onTouchEnd={handleStopMove}
            className="py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-amber-600 border border-navy-700 text-xs font-bold text-amber-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
          >
            <span>-</span>
            <span>ZOOM OUT</span>
          </button>
        </div>
      </div>

      {/* Speed Slider */}
      <div className="mt-2.5 pt-2 border-t border-navy-800/80 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-navy-400">PAN/TILT VELOCITY</span>
          <span className="text-amber-300 font-bold">{(speed * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-full h-1 bg-navy-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
        <div className="flex justify-between text-[9px] text-navy-500">
          <span>Precise (10%)</span>
          <span>Rapid (100%)</span>
        </div>
      </div>

      {/* Presets Management */}
      <div className="mt-2.5 pt-2 border-t border-navy-800/80 space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-navy-400 font-semibold uppercase">PRESETS</span>
          <span className="text-navy-500 text-[9px]">{presets.length} POSITIONS</span>
        </div>

        {presets.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="flex-1 bg-navy-900 border border-navy-700 text-navy-200 text-xs rounded-lg px-2 py-1 outline-hidden"
            >
              {presets.map((p) => (
                <option key={p.token} value={p.token}>
                  {p.name || `Preset ${p.token}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGotoPreset}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold border border-amber-400/50 transition-colors cursor-pointer shadow-xs"
            >
              Go
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Name current view..."
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            className="flex-1 bg-navy-900 border border-navy-700 text-navy-200 text-xs rounded-lg px-2 py-1 placeholder-navy-500 outline-hidden"
          />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={isSavingPreset || !newPresetName.trim()}
            className="px-2.5 py-1 rounded-lg bg-navy-800 hover:bg-navy-700 disabled:opacity-50 text-white text-xs font-semibold border border-navy-600 transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>

      {/* Status Footer */}
      {statusMessage && (
        <div className="mt-2.5 pt-2 border-t border-navy-800/80 text-[10px] text-amber-300 truncate">
          ▶ {statusMessage}
        </div>
      )}
    </div>
  );
}
