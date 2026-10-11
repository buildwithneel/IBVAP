import React, { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Camera } from "../types";
import { api } from "../services/api";
import { useSurveillanceStream } from "../context/SurveillanceStreamContext";
import { useNavigate } from "react-router-dom";
import { VirtualFenceManager } from "./VirtualFenceManager";
import {
  Crosshair,
  Layers,
  Camera as CameraIcon,
  Maximize2,
  Minimize2,
  Shield,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Radar,
  Radio,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Compass,
  X,
} from "lucide-react";

// Default coordinates for Sector Alpha simulated border cameras
const DEFAULT_CAMERA_COORDS: Record<string, [number, number]> = {
  "SIM-CAM-01": [31.652, 74.581], // Sector Alpha - Gate 1 Checkpoint
  "SIM-CAM-02": [31.6585, 74.5862], // Sector Alpha - Perimeter Watchtower 2
  "SIM-CAM-03": [31.6642, 74.5918], // Sector Alpha - Outer Patrol Post 3
  "SIM-CAM-04": [31.6701, 74.5985], // Sector Alpha - Buffer Checkpoint 4
};

const SECTOR_ALPHA_CENTER: [number, number] = [31.6585, 74.5862];

// Tactical international border demarcation line
const BORDER_DEMARCATION_LINE: [number, number][] = [
  [31.646, 74.575],
  [31.652, 74.581],
  [31.6585, 74.5862],
  [31.6642, 74.5918],
  [31.6701, 74.5985],
  [31.677, 74.6045],
];

// Tactical buffer zone restricted polygon
const BUFFER_ZONE_POLYGON: [number, number][] = [
  [31.644, 74.571],
  [31.679, 74.599],
  [31.682, 74.611],
  [31.647, 74.583],
];

interface TacticalSurveillanceMapProps {
  className?: string;
  onCameraSelect?: (camera: Camera) => void;
}

export default function TacticalSurveillanceMap({
  className = "",
  onCameraSelect,
}: TacticalSurveillanceMapProps) {
  const navigate = useNavigate();
  const { cameraList, activeCameraId, setActiveCameraId } = useSurveillanceStream();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const circlesGroupRef = useRef<L.LayerGroup | null>(null);
  const polygonGroupRef = useRef<L.LayerGroup | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Map layer toggle states
  const [showCoverageRadius, setShowCoverageRadius] = useState<boolean>(true);
  const [showBufferZone, setShowBufferZone] = useState<boolean>(true);
  const [mapType, setMapType] = useState<"dark" | "satellite">("dark");
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Inspector & modal states
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [fenceModalOpen, setFenceModalOpen] = useState<boolean>(false);
  const [videoPlaying, setVideoPlaying] = useState<boolean>(true);
  const [videoLoop, setVideoLoop] = useState<boolean>(true);
  const [snapshotLoading, setSnapshotLoading] = useState<boolean>(false);
  const [snapshotFeedback, setSnapshotFeedback] = useState<{
    success: boolean;
    message: string;
    hash?: string;
  } | null>(null);
  const [activeZoneCount, setActiveZoneCount] = useState<number | null>(null);

  // Map center coordinates display
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lng: number }>({
    lat: SECTOR_ALPHA_CENTER[0],
    lng: SECTOR_ALPHA_CENTER[1],
  });

  // Active selected camera
  const selectedCamera = useMemo(() => {
    return cameraList.find((c) => c.id === activeCameraId) || cameraList[0] || null;
  }, [cameraList, activeCameraId]);

  // Derive coordinates for a camera
  const getCameraCoords = (camera: Camera, index: number): [number, number] => {
    if (camera.latitude && camera.longitude) {
      return [camera.latitude, camera.longitude];
    }
    if (DEFAULT_CAMERA_COORDS[camera.id]) {
      return DEFAULT_CAMERA_COORDS[camera.id];
    }
    // Deterministic offset along the sector boundary
    return [31.652 + index * 0.0055, 74.581 + index * 0.0055];
  };

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: SECTOR_ALPHA_CENTER,
      zoom: 14,
      minZoom: 12,
      maxZoom: 18,
      zoomControl: false,
    });

    // Dark military carto layer
    const darkTiles = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
        maxZoom: 19,
        subdomains: "abcd",
      }
    ).addTo(map);

    tileLayerRef.current = darkTiles;

    // Zoom control in top right
    L.control.zoom({ position: "topright" }).addTo(map);

    // Track center coordinates on move
    map.on("move", () => {
      const c = map.getCenter();
      setCenterCoords({ lat: Number(c.lat.toFixed(4)), lng: Number(c.lng.toFixed(4)) });
    });

    // Layer groups for overlays
    circlesGroupRef.current = L.layerGroup().addTo(map);
    polygonGroupRef.current = L.layerGroup().addTo(map);

    // Add tactical buffer zone polygon
    const bufferPoly = L.polygon(BUFFER_ZONE_POLYGON, {
      color: "#22c55e",
      fillColor: "#15803d",
      fillOpacity: 0.12,
      weight: 1.5,
      dashArray: "6, 6",
    });
    bufferPoly.bindTooltip("TACTICAL BUFFER ZONE — SECTOR ALPHA", {
      className: "military-leaflet-tooltip",
      sticky: true,
    });
    polygonGroupRef.current.addLayer(bufferPoly);

    // Add border demarcation line
    const borderLine = L.polyline(BORDER_DEMARCATION_LINE, {
      color: "#f59e0b",
      weight: 2.5,
      dashArray: "8, 6",
      opacity: 0.85,
    });
    borderLine.bindTooltip("INTERNATIONAL BORDER DEMARCATION / PERIMETER FENCE", {
      className: "military-leaflet-tooltip",
      sticky: true,
    });
    polygonGroupRef.current.addLayer(borderLine);

    mapRef.current = map;

    // Invalidate size after layout settles
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Toggle Map Base Tile Layer (Dark Tactical vs Satellite)
  useEffect(() => {
    if (!mapRef.current) return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }

    if (mapType === "satellite") {
      tileLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS",
          maxZoom: 18,
        }
      ).addTo(mapRef.current);
    } else {
      tileLayerRef.current = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(mapRef.current);
    }
  }, [mapType]);

  // 3. Toggle Buffer Zone Visibility
  useEffect(() => {
    if (!mapRef.current || !polygonGroupRef.current) return;
    if (showBufferZone) {
      if (!mapRef.current.hasLayer(polygonGroupRef.current)) {
        mapRef.current.addLayer(polygonGroupRef.current);
      }
    } else {
      if (mapRef.current.hasLayer(polygonGroupRef.current)) {
        mapRef.current.removeLayer(polygonGroupRef.current);
      }
    }
  }, [showBufferZone]);

  // 4. Update Camera Markers & Coverage Radii
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current.clear();

    if (circlesGroupRef.current) {
      circlesGroupRef.current.clearLayers();
    }

    cameraList.forEach((cam, idx) => {
      const coords = getCameraCoords(cam, idx);
      const isSelected = selectedCamera?.id === cam.id;
      const isLive = cam.status === "ACTIVE";
      const isAlert = cam.status === "ALERT";

      // Color scheme based on state
      const statusColor = isAlert ? "#ef4444" : isLive ? "#10b981" : "#64748b";
      const glowColor = isAlert
        ? "rgba(239, 68, 68, 0.4)"
        : isLive
        ? "rgba(16, 185, 129, 0.4)"
        : "rgba(100, 116, 139, 0.2)";

      // Custom military reticle HTML icon
      const iconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer select-none group">
          <!-- Outer pulsating radar ring -->
          ${
            isLive || isAlert
              ? `<div class="absolute -inset-2 rounded-full animate-ping opacity-60" style="background-color: ${glowColor}; animation-duration: ${
                  isAlert ? "1s" : "2.5s"
                }"></div>`
              : ""
          }

          <!-- Selected tactical crosshair bracket -->
          ${
            isSelected
              ? `<div class="absolute -inset-3.5 border border-amber-400/80 rounded-full animate-spin-slow pointer-events-none" style="border-style: dashed;"></div>
                 <div class="absolute -inset-2.5 border-2 border-amber-400 rounded-sm pointer-events-none"></div>`
              : ""
          }

          <!-- Core Reticle Circle -->
          <div class="relative flex items-center justify-center w-7 h-7 rounded-full border-2 shadow-lg transition-transform transform group-hover:scale-110"
               style="background-color: #0b1120; border-color: ${
                 isSelected ? "#fbbf24" : statusColor
               }; box-shadow: 0 0 12px ${glowColor}">
            <!-- Crosshair hairs -->
            <div class="absolute w-full h-[1px] bg-slate-500/50"></div>
            <div class="absolute h-full w-[1px] bg-slate-500/50"></div>
            <!-- Center LED dot -->
            <div class="w-2 h-2 rounded-full" style="background-color: ${statusColor}"></div>
          </div>

          <!-- Camera Code Tactical Pill -->
          <div class="absolute -bottom-5 whitespace-nowrap px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider text-slate-100 bg-slate-950/90 border transition-all ${
            isSelected
              ? "border-amber-400 text-amber-300 shadow-md scale-105"
              : "border-slate-700/80 text-slate-300"
          }">
            ${cam.code}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: "custom-military-marker",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker(coords, { icon: customIcon });

      // Click handler
      marker.on("click", () => {
        setActiveCameraId(cam.id);
        if (onCameraSelect) onCameraSelect(cam);
        setInspectorOpen(true);
        map.flyTo(coords, Math.max(map.getZoom(), 15), { duration: 0.8 });
      });

      // Hover tooltip
      marker.bindTooltip(
        `<div class="font-mono text-xs">
          <div class="font-bold text-amber-300">${cam.code} &bull; ${cam.name}</div>
          <div class="text-slate-300 text-[10px]">${cam.sector} | Status: <span style="color: ${statusColor}">${cam.status}</span></div>
        </div>`,
        { direction: "top", offset: [0, -18], className: "tactical-tooltip" }
      );

      marker.addTo(map);
      markersRef.current.set(cam.id, marker);

      // Add 250m Coverage Radius circle if enabled
      if (showCoverageRadius && circlesGroupRef.current) {
        const circle = L.circle(coords, {
          radius: 250,
          color: isAlert ? "#ef4444" : isLive ? "#10b981" : "#64748b",
          weight: 1,
          fillColor: isAlert ? "#ef4444" : isLive ? "#10b981" : "#64748b",
          fillOpacity: 0.07,
          dashArray: "4, 4",
        });
        circle.bindTooltip(`Sensor FOV (250m) &bull; ${cam.code}`, {
          sticky: true,
          className: "military-leaflet-tooltip",
        });
        circlesGroupRef.current.addLayer(circle);
      }
    });
  }, [cameraList, selectedCamera, showCoverageRadius, setActiveCameraId, onCameraSelect]);

  // 5. Fetch AI Virtual Fence Status for Selected Camera
  useEffect(() => {
    if (!selectedCamera) return;
    let isMounted = true;

    async function checkFence() {
      try {
        const zones = await api.getZones(selectedCamera!.id);
        if (isMounted) {
          setActiveZoneCount(Array.isArray(zones) ? zones.length : 0);
        }
      } catch {
        if (isMounted) setActiveZoneCount(0);
      }
    }

    checkFence();
    return () => {
      isMounted = false;
    };
  }, [selectedCamera]);

  // 6. Instant Snapshot Capture Handler
  const handleTakeSnapshot = async () => {
    if (!selectedCamera) return;
    setSnapshotLoading(true);
    setSnapshotFeedback(null);
    try {
      const res = await api.captureCameraSnapshot(selectedCamera.id);
      if (res && (res.evidence_id || res.capture_status === "SUCCESS")) {
        setSnapshotFeedback({
          success: true,
          message: `Frame Captured & Evidence Logged`,
          hash: res.sha256 ? res.sha256.substring(0, 16) + "..." : undefined,
        });
      } else {
        setSnapshotFeedback({
          success: false,
          message: "Snapshot capture failed",
        });
      }
    } catch (e: any) {
      setSnapshotFeedback({
        success: false,
        message: e?.message || "Capture error",
      });
    } finally {
      setSnapshotLoading(false);
      setTimeout(() => {
        setSnapshotFeedback(null);
      }, 6000);
    }
  };

  // Video Controls
  const togglePlay = () => {
    if (videoRef.current) {
      if (videoPlaying) {
        videoRef.current.pause();
        setVideoPlaying(false);
      } else {
        videoRef.current.play();
        setVideoPlaying(true);
      }
    }
  };

  const handleReplay = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setVideoPlaying(true);
    }
  };

  const handleFitFleet = () => {
    if (!mapRef.current || cameraList.length === 0) return;
    const bounds = L.latLngBounds(
      cameraList.map((c, idx) => getCameraCoords(c, idx))
    );
    bounds.extend(BORDER_DEMARCATION_LINE);
    mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  };

  return (
    <div
      className={`bg-slate-950 rounded-xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col relative text-slate-100 ${className}`}
    >
      {/* 1. Tactical HUD Header Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
            <span className="w-2 h-2 rounded-full bg-emerald-500 relative" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold font-mono tracking-wider text-slate-200 uppercase flex items-center gap-1.5">
                <Radar className="w-3.5 h-3.5 text-emerald-400" />
                Tactical Border Surveillance Map
              </h2>
              <span className="text-[9px] font-mono uppercase bg-amber-950/80 text-amber-300 border border-amber-800/80 px-1.5 py-0.2 rounded font-semibold">
                Tactical Sector Grid (Simulated GPS)
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2 mt-0.5">
              <span>SECTOR ALPHA CORRIDOR</span>
              <span>&bull;</span>
              <span>
                LAT: {centerCoords.lat}° N &bull; LON: {centerCoords.lng}° E
              </span>
              <span>&bull;</span>
              <span className="text-emerald-400">DEFCON-5 (NORMAL)</span>
            </div>
          </div>
        </div>

        {/* Tactical Map Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowCoverageRadius((prev) => !prev)}
            className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition-colors border flex items-center gap-1 cursor-pointer ${
              showCoverageRadius
                ? "bg-emerald-950 text-emerald-300 border-emerald-700"
                : "bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700"
            }`}
            title="Toggle Sensor 250m FOV Range Radii"
          >
            <Radio className="w-3 h-3" />
            FOV Rings
          </button>

          <button
            type="button"
            onClick={() => setShowBufferZone((prev) => !prev)}
            className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition-colors border flex items-center gap-1 cursor-pointer ${
              showBufferZone
                ? "bg-amber-950 text-amber-300 border-amber-700"
                : "bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700"
            }`}
            title="Toggle Perimeter Buffer Zone"
          >
            <Shield className="w-3 h-3" />
            Buffer Zone
          </button>

          <button
            type="button"
            onClick={() =>
              setMapType((prev) => (prev === "dark" ? "satellite" : "dark"))
            }
            className="px-2 py-1 rounded text-[11px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            title="Switch Map Tile Source"
          >
            <Layers className="w-3 h-3" />
            {mapType === "dark" ? "Satellite" : "Dark HUD"}
          </button>

          <button
            type="button"
            onClick={handleFitFleet}
            className="px-2 py-1 rounded text-[11px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            title="Reset View to Full Camera Perimeter"
          >
            <Crosshair className="w-3 h-3" />
            Fit Perimeter
          </button>
        </div>
      </div>

      {/* 2. Map Container with Floating Tactical Video Inspector */}
      <div className="relative w-full h-[520px] bg-slate-950">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Legend Overlay in Bottom Left */}
        <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-800 p-2.5 rounded-lg text-[10px] font-mono space-y-1.5 shadow-xl max-w-[200px] pointer-events-auto">
          <div className="font-bold text-slate-300 text-[10px] tracking-wider uppercase border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>Tactical Legend</span>
            <span className="text-[9px] text-slate-500">IND-PAK</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-300">Camera Online (ACTIVE)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-slate-300">Camera Alert State</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-slate-400">Offline / Standby</span>
          </div>
          <div className="flex items-center gap-2 pt-0.5 border-t border-slate-800/80">
            <div className="w-3.5 h-0.5 bg-amber-400 border border-dashed border-amber-400" />
            <span className="text-amber-300 text-[9px]">Perimeter Fence Line</span>
          </div>
        </div>

        {/* Floating / Docked Tactical Camera Inspector Overlay */}
        {selectedCamera && inspectorOpen && (
          <div className="absolute top-3 right-3 bottom-3 z-[450] w-full max-w-[380px] bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
            {/* Inspector Header */}
            <div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedCamera.status === "ALERT"
                      ? "bg-red-500 animate-ping"
                      : selectedCamera.status === "ACTIVE"
                      ? "bg-emerald-500"
                      : "bg-slate-500"
                  }`}
                />
                <span className="font-mono font-bold text-xs text-amber-300">
                  {selectedCamera.code}
                </span>
                <span className="text-[11px] font-semibold text-slate-200 truncate">
                  {selectedCamera.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                    selectedCamera.status === "ACTIVE"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : selectedCamera.status === "ALERT"
                      ? "bg-red-950 text-red-400 border border-red-800"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {selectedCamera.status}
                </span>
                <button
                  type="button"
                  onClick={() => setInspectorOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                  title="Close Inspector"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Inspector Body: Live Video Preview */}
            <div className="p-3 space-y-3 overflow-y-auto flex-1 text-xs font-mono">
              {/* Live Video Frame */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 group shadow-inner">
                {selectedCamera.status === "ACTIVE" ? (
                  selectedCamera.isSimulated && selectedCamera.videoUrl ? (
                    <video
                      ref={videoRef}
                      src={selectedCamera.videoUrl}
                      autoPlay
                      loop={videoLoop}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={api.getMjpegStreamUrl(selectedCamera.id)}
                      alt={selectedCamera.name}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-1.5 p-4 text-center">
                    <CameraIcon className="w-8 h-8 opacity-40" />
                    <span className="text-[11px]">FEED OFFLINE / STANDBY</span>
                    <span className="text-[9px] text-slate-600">
                      Camera station not transmitting telemetry
                    </span>
                  </div>
                )}

                {/* HUD Scanlines & Metadata Overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.6)_100%)] flex flex-col justify-between p-2">
                  <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400 drop-shadow-sm">
                    <span className="flex items-center gap-1 bg-black/60 px-1 py-0.5 rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      REC &bull; LIVE
                    </span>
                    <span className="bg-black/60 px-1 py-0.5 rounded">
                      {selectedCamera.resolution || "720p HD"} &bull; {selectedCamera.fps || 25} FPS
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-300 drop-shadow-sm">
                    <span className="bg-black/60 px-1 py-0.5 rounded">
                      {selectedCamera.sector}
                    </span>
                    <span className="bg-black/60 px-1 py-0.5 rounded text-amber-300">
                      {selectedCamera.ipAddress}
                    </span>
                  </div>
                </div>
              </div>

              {/* Feed Controls & Instant Snapshot Action Bar */}
              <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    {selectedCamera.isSimulated && selectedCamera.videoUrl && (
                      <>
                        <button
                          type="button"
                          onClick={togglePlay}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                          title={videoPlaying ? "Pause Video" : "Play Video"}
                        >
                          {videoPlaying ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleReplay}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                          title="Replay Video from Start"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Instant Forensic Snapshot Button */}
                  <button
                    type="button"
                    onClick={handleTakeSnapshot}
                    disabled={snapshotLoading || selectedCamera.status !== "ACTIVE"}
                    className="flex-1 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono font-bold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <CameraIcon className="w-3.5 h-3.5" />
                    {snapshotLoading ? "Capturing..." : "Take Snapshot"}
                  </button>
                </div>

                {/* Snapshot Feedback Message */}
                {snapshotFeedback && (
                  <div
                    className={`p-1.5 rounded text-[10px] font-mono flex items-center justify-between gap-1 ${
                      snapshotFeedback.success
                        ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                        : "bg-red-950/80 text-red-300 border border-red-800"
                    }`}
                  >
                    <div className="flex items-center gap-1 truncate">
                      {snapshotFeedback.success ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                      <span className="truncate">{snapshotFeedback.message}</span>
                    </div>
                    {snapshotFeedback.hash && (
                      <span className="text-[9px] text-slate-400 font-mono shrink-0">
                        {snapshotFeedback.hash}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* AI Virtual Fence Telemetry Strip */}
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Shield className="w-3 h-3 text-amber-400" />
                    AI Boundary Protection
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                      activeZoneCount && activeZoneCount > 0
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    {activeZoneCount && activeZoneCount > 0
                      ? `${activeZoneCount} BOUNDARY ACTIVE`
                      : "NO BOUNDARY CONFIGURED"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Perimeter virtual fencing detects intrusions and crossing in real-time.
                </p>
                <button
                  type="button"
                  onClick={() => setFenceModalOpen(true)}
                  className="w-full mt-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-mono font-medium border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Inspect AI Virtual Boundary
                </button>
              </div>

              {/* Quick Navigation Links */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => navigate("/dashboard/analysis")}
                  className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono font-medium border border-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  Forensic Lab
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/dashboard/cameras")}
                  className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono font-medium border border-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <ExternalLink className="w-3 h-3" />
                  Camera Grid
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Camera Fleet Quick-Select Ribbon */}
      <div className="bg-slate-900 border-t border-slate-800 p-2.5">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-emerald-400" />
            Border Fleet Stations ({cameraList.length} Units)
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            Click any station to focus camera feed &amp; telemetry
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {cameraList.map((cam, idx) => {
            const isSelected = selectedCamera?.id === cam.id;
            const isLive = cam.status === "ACTIVE";
            const isAlert = cam.status === "ALERT";
            const coords = getCameraCoords(cam, idx);

            return (
              <button
                key={cam.id}
                type="button"
                onClick={() => {
                  setActiveCameraId(cam.id);
                  if (onCameraSelect) onCameraSelect(cam);
                  setInspectorOpen(true);
                  if (mapRef.current) {
                    mapRef.current.flyTo(coords, 15, { duration: 0.8 });
                  }
                }}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? "bg-slate-800 border-amber-400 ring-1 ring-amber-400/50 shadow-md"
                    : "bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isAlert
                          ? "bg-red-500 animate-ping"
                          : isLive
                          ? "bg-emerald-500"
                          : "bg-slate-500"
                      }`}
                    />
                    <span className="font-mono text-xs font-bold text-slate-200">
                      {cam.code}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {cam.name.replace(/^SIM-CAM-\d+\s*/, "")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold block ${
                      isAlert
                        ? "bg-red-950 text-red-400"
                        : isLive
                        ? "bg-emerald-950 text-emerald-400"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {isLive ? "ONLINE" : "STANDBY"}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                    {cam.sector.replace("Sector ", "SEC-")}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. AI Virtual Fence Manager Modal */}
      {fenceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
            <VirtualFenceManager
              cameras={cameraList.map((c) => ({
                id: c.id,
                name: c.name,
                code: c.code,
                stream_url: c.streamUrl,
              }))}
              initialCameraId={selectedCamera?.id}
              onClose={() => setFenceModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
