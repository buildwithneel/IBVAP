import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Shield,
  Trash2,
  CheckCircle,
  Sparkles,
  Lock,
  X,
  AlertTriangle,
  RefreshCw,
  Edit3,
  Move,
  Plus,
  ArrowRight,
  ArrowLeftRight,
  Check,
  Undo2,
  Power,
  Layers,
  Info,
  Maximize2
} from "lucide-react";
import { api } from "../services/api";
import { Camera } from "../types";

export interface VirtualFenceManagerProps {
  cameras: Array<{
    id: string;
    name: string;
    stream_url?: string;
    code?: string;
    status?: string;
    sector?: string;
    videoUrl?: string;
    isSimulated?: boolean;
    postNumber?: string;
  }>;
  initialCameraId?: string;
  onClose?: () => void;
}

type DrawMode = "none" | "line" | "polygon";

interface Point {
  x: number;
  y: number;
}

export const VirtualFenceManager: React.FC<VirtualFenceManagerProps> = ({
  cameras,
  initialCameraId,
  onClose,
}) => {
  const [selectedCameraId, setSelectedCameraId] = useState<string>(
    initialCameraId || cameras[0]?.id || ""
  );
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [detecting, setDetecting] = useState<boolean>(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Drawing state
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);

  // Selected fence for editing
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<any | null>(null);
  const [isDraggingVertex, setIsDraggingVertex] = useState<number | null>(null);
  const [isDraggingZone, setIsDraggingZone] = useState<boolean>(false);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null);

  // Editable Form State
  const [fenceForm, setFenceForm] = useState({
    name: "",
    zone_type: "restricted",
    zone_kind: "POLYGON",
    crossing_direction: "both",
    status: "CONFIRMED",
    enabled: true,
    monitored_objects: ["person", "car", "truck", "motorcycle"],
    dwell_time_seconds: 30,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setFeedback({ message, type });
    setTimeout(() => {
      setFeedback((cur) => (cur?.message === message ? null : cur));
    }, 4000);
  };

  // Sync initialCameraId if prop updates
  useEffect(() => {
    if (initialCameraId && initialCameraId !== selectedCameraId) {
      setSelectedCameraId(initialCameraId);
    }
  }, [initialCameraId]);

  // Load zones whenever camera selection changes
  const fetchZones = useCallback(async (camId: string) => {
    setLoading(true);
    try {
      const data = await api.listZones(camId, true);
      setZones(data || []);
    } catch (err) {
      console.error("Failed to load zones for camera:", camId, err);
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCameraId) {
      setSelectedZoneId(null);
      setSelectedZone(null);
      setAiSuggestions([]);
      setCurrentPoints([]);
      setDrawMode("none");
      fetchZones(selectedCameraId);
    }
  }, [selectedCameraId, fetchZones]);

  // Sync form state when selected zone changes
  useEffect(() => {
    if (selectedZone) {
      const isEnabled = selectedZone.status === "CONFIRMED" || selectedZone.status === "active";
      setFenceForm({
        name: selectedZone.name || "Perimeter Fence",
        zone_type: selectedZone.zone_type || "restricted",
        zone_kind: selectedZone.zone_kind || "POLYGON",
        crossing_direction: selectedZone.crossing_direction || "both",
        status: selectedZone.status || "CONFIRMED",
        enabled: isEnabled,
        monitored_objects: selectedZone.monitored_objects || ["person", "car", "truck", "motorcycle"],
        dwell_time_seconds: selectedZone.rules_config?.loitering_dwell_seconds || 30,
      });
    }
  }, [selectedZone]);

  const activeCamObj = cameras.find((c) => c.id === selectedCameraId) || cameras[0];
  const isCamOnline = activeCamObj?.status === "ACTIVE" || activeCamObj?.status === "ALERT" || Boolean(activeCamObj?.isSimulated && activeCamObj.status !== "OFFLINE" && activeCamObj.status !== "NOT_CONNECTED");

  // Normalized coordinate helper (0.0 to 1.0)
  const getNormalizedPoint = (e: React.MouseEvent<SVGSVGElement>): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
  };

  // Click on SVG canvas (Drawing points or deselecting)
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drawMode === "none") {
      // If clicking empty canvas area, deselect current zone
      if ((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).id === "bg-grid") {
        setSelectedZoneId(null);
        setSelectedZone(null);
      }
      return;
    }

    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (drawMode === "line") {
      const newPoints = [...currentPoints, pt];
      setCurrentPoints(newPoints);
      if (newPoints.length >= 2) {
        // Line can be finalized or extended
      }
    } else if (drawMode === "polygon") {
      // If clicking near first point after at least 3 points, close polygon
      if (currentPoints.length >= 3) {
        const first = currentPoints[0];
        const dist = Math.hypot(pt.x - first.x, pt.y - first.y);
        if (dist < 0.035) {
          finalizeDrawing(currentPoints);
          return;
        }
      }
      setCurrentPoints([...currentPoints, pt]);
    }
  };

  // Mouse move on canvas (for dynamic drawing preview & vertex dragging)
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = getNormalizedPoint(e);
    if (!pt) return;
    setCursorPos(pt);

    // Handle vertex dragging
    if (isDraggingVertex !== null && selectedZone) {
      const updatedPoly = [...selectedZone.polygon];
      updatedPoly[isDraggingVertex] = [pt.x, pt.y];
      const updatedZone = { ...selectedZone, polygon: updatedPoly };
      setSelectedZone(updatedZone);
      setZones((prev) => prev.map((z) => (z.id === selectedZone.id ? updatedZone : z)));
    }
  };

  const handleMouseUp = () => {
    if (isDraggingVertex !== null) {
      setIsDraggingVertex(null);
      // Auto-save edited vertex coordinates
      if (selectedZone) {
        handleSaveZoneGeometry(selectedZone);
      }
    }
    if (isDraggingZone) {
      setIsDraggingZone(false);
      setDragStartPos(null);
    }
  };

  // Finalize Drawing & create draft zone
  const finalizeDrawing = async (pointsToUse?: Point[]) => {
    const pts = pointsToUse || currentPoints;
    if (drawMode === "line" && pts.length < 2) {
      showToast("A Line virtual fence requires at least 2 points.", "error");
      return;
    }
    if (drawMode === "polygon" && pts.length < 3) {
      showToast("A Polygon zone requires at least 3 points.", "error");
      return;
    }

    const polyCoords = pts.map((p) => [p.x, p.y]);
    const kind = drawMode === "line" ? "LINE" : "POLYGON";
    const defaultName = kind === "LINE"
      ? `Virtual Fence ${zones.filter((z) => z.zone_kind === "LINE").length + 1}`
      : `Restricted Zone ${zones.filter((z) => z.zone_kind === "POLYGON").length + 1}`;

    try {
      const payload = {
        camera_id: selectedCameraId,
        name: defaultName,
        polygon: polyCoords,
        zone_type: "restricted",
        zone_kind: kind,
        status: "CONFIRMED",
        crossing_direction: "both",
        monitored_objects: ["person", "car", "truck", "motorcycle"],
        rules_config: { loitering_dwell_seconds: 30 },
      };

      const created = await api.createZone(payload);
      setZones((prev) => [...prev, created]);
      setSelectedZoneId(created.id);
      setSelectedZone(created);
      setDrawMode("none");
      setCurrentPoints([]);
      showToast(`Created ${kind === "LINE" ? "Line Fence" : "Zone"}: "${defaultName}". Configure details on the right.`);
    } catch (err: any) {
      console.error("Failed to create zone:", err);
      showToast("Failed to create zone on server.", "error");
    }
  };

  // Undo last point in drawing mode
  const handleUndoPoint = () => {
    if (currentPoints.length > 0) {
      setCurrentPoints(currentPoints.slice(0, -1));
    }
  };

  // Cancel drawing
  const handleCancelDrawing = () => {
    setDrawMode("none");
    setCurrentPoints([]);
    showToast("Drawing cancelled.", "info");
  };

  // Save modified geometry
  const handleSaveZoneGeometry = async (zoneObj: any) => {
    try {
      const payload = {
        polygon: zoneObj.polygon,
        status: zoneObj.status || "CONFIRMED",
      };
      await api.updateZone(zoneObj.id, payload);
    } catch (err) {
      console.error("Failed to auto-save moved points:", err);
    }
  };

  // AI-Assisted Boundary Suggestions
  const handleDetectBoundaries = async () => {
    if (!selectedCameraId) return;
    setDetecting(true);
    setAiSuggestions([]);
    try {
      const res = await api.detectCameraBoundaries(selectedCameraId);
      const suggs = res.suggestions || [];
      setAiSuggestions(suggs);
      if (suggs.length > 0) {
        showToast(`AI detected ${suggs.length} boundary proposal(s). Review and confirm below.`);
      } else {
        showToast("No clear perimeter lines detected in frame. You can draw manual fences.", "info");
      }
    } catch (err) {
      console.error("Failed to detect boundaries:", err);
      showToast("AI boundary detection unavailable for this stream.", "error");
    } finally {
      setDetecting(false);
    }
  };

  // Convert AI suggestion into active/editable zone
  const handleAcceptSuggestion = async (suggestion: any) => {
    try {
      const payload = {
        camera_id: selectedCameraId,
        name: suggestion.label || "AI Detected Perimeter",
        polygon: suggestion.polygon,
        zone_type: suggestion.suggested_zone_type || "restricted",
        zone_kind: suggestion.zone_kind || "POLYGON",
        status: "CONFIRMED",
        crossing_direction: "both",
        monitored_objects: ["person", "car", "truck", "motorcycle"],
        rules_config: { loitering_dwell_seconds: 30 },
      };
      const created = await api.createZone(payload);
      setZones((prev) => [...prev, created]);
      setSelectedZoneId(created.id);
      setSelectedZone(created);
      setAiSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      showToast(`Accepted AI proposal: "${created.name}". You can now edit its points or parameters.`);
    } catch (err) {
      console.error("Failed to accept suggestion:", err);
      showToast("Failed to save AI suggestion.", "error");
    }
  };

  // Save / Update form changes to backend
  const handleSaveFormChanges = async () => {
    if (!selectedZone) return;
    try {
      const newStatus = fenceForm.enabled ? "CONFIRMED" : "DISABLED";
      const payload = {
        name: fenceForm.name,
        zone_type: fenceForm.zone_type,
        zone_kind: fenceForm.zone_kind,
        crossing_direction: fenceForm.crossing_direction,
        status: newStatus,
        monitored_objects: fenceForm.monitored_objects,
        rules_config: { loitering_dwell_seconds: fenceForm.dwell_time_seconds },
      };

      const updated = await api.updateZone(selectedZone.id, payload);
      setZones((prev) => prev.map((z) => (z.id === updated.id ? updated : z)));
      setSelectedZone(updated);
      showToast(`Saved configuration for "${updated.name}" (${newStatus}).`);
    } catch (err) {
      console.error("Failed to update zone:", err);
      showToast("Failed to save zone settings.", "error");
    }
  };

  // Toggle Enable / Disable
  const handleToggleEnable = async (zone: any) => {
    const isCurrentlyEnabled = zone.status === "CONFIRMED" || zone.status === "active";
    const nextStatus = isCurrentlyEnabled ? "DISABLED" : "CONFIRMED";
    try {
      const updated = await api.updateZone(zone.id, { status: nextStatus });
      setZones((prev) => prev.map((z) => (z.id === updated.id ? updated : z)));
      if (selectedZone?.id === zone.id) {
        setSelectedZone(updated);
        setFenceForm((prev) => ({ ...prev, enabled: !isCurrentlyEnabled, status: nextStatus }));
      }
      showToast(`Fence "${zone.name}" is now ${nextStatus === "CONFIRMED" ? "ENABLED" : "DISABLED"}.`);
    } catch (err) {
      console.error("Failed to toggle zone status:", err);
      showToast("Failed to update status on server.", "error");
    }
  };

  // Delete fence
  const handleDeleteFence = async (zoneId: string) => {
    try {
      await api.deleteZone(zoneId);
      setZones((prev) => prev.filter((z) => z.id !== zoneId));
      if (selectedZoneId === zoneId) {
        setSelectedZoneId(null);
        setSelectedZone(null);
      }
      showToast("Virtual fence deleted successfully.");
    } catch (err) {
      console.error("Failed to delete zone:", err);
      showToast("Failed to delete fence.", "error");
    }
  };

  // Monitored objects toggle
  const toggleMonitoredObject = (objType: string) => {
    setFenceForm((prev) => {
      const list = prev.monitored_objects || [];
      const updated = list.includes(objType)
        ? list.filter((o) => o !== objType)
        : [...list, objType];
      return { ...prev, monitored_objects: updated };
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full text-slate-100 font-sans">
      {/* 1. Header Toolbar */}
      <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide uppercase font-mono">
                Manual Virtual Fencing &amp; AI Customization
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                24 CAM ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Visual Perimeter Tripwires • Closed Polygon Zones • Directional Rules • Camera-Specific
            </p>
          </div>
        </div>

        {/* Camera Selector and Primary Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Camera Dropdown (24 Cameras) */}
          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-xl border border-slate-700">
            <span className="text-[11px] text-slate-400 font-mono">Camera:</span>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="bg-transparent text-slate-100 text-xs font-mono font-semibold focus:outline-none cursor-pointer"
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                  {c.code || c.id} — {c.name} {c.status === "ACTIVE" ? "● LIVE" : c.status === "OFFLINE" ? "○ OFFLINE" : "◌ NOT CONNECTED"}
                </option>
              ))}
            </select>
          </div>

          {/* AI Detect Boundaries */}
          <button
            onClick={handleDetectBoundaries}
            disabled={detecting}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-medium text-xs rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Scan camera view with OpenCV edge & contour AI to propose boundary fences"
          >
            <Sparkles className={`w-3.5 h-3.5 ${detecting ? "animate-spin" : ""}`} />
            <span>{detecting ? "Scanning Feed..." : "AI Detect Boundaries"}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchZones(selectedCameraId)}
            disabled={loading}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors border border-slate-800"
            title="Refresh Fences"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors border border-slate-800"
              title="Close Configuration Mode"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Interactive Tool Strip (Draw Mode / Tools) */}
      <div className="px-5 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mr-1">
            Tools:
          </span>

          <button
            type="button"
            onClick={() => {
              setDrawMode("none");
              setCurrentPoints([]);
            }}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              drawMode === "none"
                ? "bg-slate-800 text-white border border-slate-600 shadow-xs"
                : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>Select &amp; Edit</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDrawMode("line");
              setCurrentPoints([]);
              setSelectedZone(null);
              setSelectedZoneId(null);
            }}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              drawMode === "line"
                ? "bg-emerald-600 text-white shadow-xs border border-emerald-500"
                : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Virtual Fence (Line)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDrawMode("polygon");
              setCurrentPoints([]);
              setSelectedZone(null);
              setSelectedZoneId(null);
            }}
            className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              drawMode === "polygon"
                ? "bg-emerald-600 text-white shadow-xs border border-emerald-500"
                : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Add Zone (Polygon)</span>
          </button>

          {drawMode !== "none" && (
            <>
              <div className="h-4 w-px bg-slate-800 mx-1" />
              <button
                type="button"
                onClick={handleUndoPoint}
                disabled={currentPoints.length === 0}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 text-slate-300 hover:text-white border border-slate-800 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                title="Undo last placed point"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo Point</span>
              </button>

              <button
                type="button"
                onClick={() => finalizeDrawing()}
                disabled={drawMode === "line" ? currentPoints.length < 2 : currentPoints.length < 3}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Complete {drawMode === "line" ? "Fence" : "Zone"} ({currentPoints.length} pts)</span>
              </button>

              <button
                type="button"
                onClick={handleCancelDrawing}
                className="px-2.5 py-1.5 rounded-lg bg-rose-950/40 text-rose-300 hover:text-rose-200 border border-rose-900/50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </>
          )}
        </div>

        {/* Drawing Status Tooltip */}
        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
          {drawMode === "line" ? (
            <span className="text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
              CLICK 2 OR MORE POINTS ON FEED TO DRAW TRIPWIRE
            </span>
          ) : drawMode === "polygon" ? (
            <span className="text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
              CLICK POINTS TO FORM CLOSED AREA • CLICK START POINT TO COMPLETE
            </span>
          ) : selectedZone ? (
            <span className="text-slate-300">
              Drag circular vertices on feed to adjust geometry • Edit parameters on right
            </span>
          ) : (
            <span>Select a fence or click "Add Virtual Fence" to draw</span>
          )}
        </div>
      </div>

      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`px-4 py-2 border-b text-xs font-mono font-medium flex items-center justify-between transition-all ${
            feedback.type === "success"
              ? "bg-emerald-950/70 border-emerald-800/60 text-emerald-300"
              : feedback.type === "error"
              ? "bg-rose-950/70 border-rose-800/60 text-rose-300"
              : "bg-slate-800 border-slate-700 text-slate-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white ml-2">✕</button>
        </div>
      )}

      {/* 3. Main Workspace: Video Feed Overlay & Parameters Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 overflow-hidden">
        {/* Left 2 Cols: Camera Feed + Canvas Overlay */}
        <div className="lg:col-span-2 bg-black relative flex flex-col justify-center items-center p-3 border-r border-slate-800 select-none overflow-hidden">
          <div
            ref={containerRef}
            className="relative w-full max-w-4xl aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl"
          >
            {/* LAYER 0: Video Feed or Offline Tactical Canvas */}
            {isCamOnline ? (
              activeCamObj?.videoUrl ? (
                <video
                  key={`${selectedCameraId}_video`}
                  src={activeCamObj.videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : (
                <img
                  key={`${selectedCameraId}_mjpeg`}
                  src={api.getMjpegStreamUrl(selectedCameraId)}
                  alt="Live Camera Feed"
                  className="w-full h-full object-cover pointer-events-none"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (!target.src.includes("/raw")) {
                      target.src = api.getRawMjpegStreamUrl(selectedCameraId);
                    }
                  }}
                />
              )
            ) : (
              /* Offline / Not Connected Tactical Backdrop */
              <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                <div
                  className="absolute inset-0 opacity-[0.08]"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                />
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
                  <Shield className="w-6 h-6" />
                </div>
                <h4 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-widest">
                  {activeCamObj?.status === "OFFLINE" ? "CAMERA OFFLINE / DISCONNECTED" : "CAMERA NOT CONNECTED"}
                </h4>
                <p className="text-[11px] font-mono text-slate-400 mt-1 max-w-md">
                  {activeCamObj?.code || selectedCameraId} &bull; {activeCamObj?.sector || "Perimeter Sector"} &bull; {activeCamObj?.postNumber || "Border Post"}
                </p>
                <div className="mt-3 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
                  Virtual Fencing Canvas Active • Fences saved here apply immediately when stream reconnects
                </div>
              </div>
            )}

            {/* LAYER 1: Interactive SVG Virtual Fencing Overlay */}
            <svg
              ref={svgRef}
              viewBox="0 0 1000 562.5"
              preserveAspectRatio="none"
              onClick={handleSvgClick}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className={`absolute inset-0 w-full h-full z-20 ${
                drawMode !== "none" ? "cursor-crosshair" : "cursor-default"
              }`}
            >
              <defs>
                {/* Arrow markers for Line Crossing Direction */}
                <marker id="arrow-emerald" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                </marker>
                <marker id="arrow-amber" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
                <marker id="arrow-rose" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
              </defs>

              {/* A. Render Saved Fences */}
              {zones.map((z) => {
                if (!z.polygon || z.polygon.length < 2) return null;
                const isSelected = selectedZoneId === z.id;
                const isEnabled = z.status === "CONFIRMED" || z.status === "active";
                const isLine = z.zone_kind === "LINE";

                // Map points to 1000x562.5 SVG viewport
                const pointsStr = z.polygon
                  .map((pt: [number, number]) => `${pt[0] * 1000},${pt[1] * 562.5}`)
                  .join(" ");

                const strokeColor = !isEnabled
                  ? "#64748b" // Gray disabled
                  : isSelected
                  ? "#38bdf8" // Bright Cyan selected
                  : z.zone_type === "warning"
                  ? "#f59e0b" // Amber
                  : "#10b981"; // Emerald green

                const fillColor = !isEnabled
                  ? "rgba(100, 116, 139, 0.08)"
                  : isSelected
                  ? "rgba(56, 189, 248, 0.22)"
                  : z.zone_type === "warning"
                  ? "rgba(245, 158, 11, 0.16)"
                  : "rgba(16, 185, 129, 0.18)";

                const firstPt = z.polygon[0];
                const lastPt = z.polygon[z.polygon.length - 1];

                return (
                  <g
                    key={z.id}
                    onClick={(e) => {
                      if (drawMode === "none") {
                        e.stopPropagation();
                        setSelectedZoneId(z.id);
                        setSelectedZone(z);
                      }
                    }}
                    className="cursor-pointer group"
                  >
                    {isLine ? (
                      // Line Fence Tripwire
                      <polyline
                        points={pointsStr}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 4 : 3}
                        strokeDasharray={!isEnabled ? "6 4" : undefined}
                        markerEnd="url(#arrow-emerald)"
                      />
                    ) : (
                      // Closed Polygon Zone
                      <polygon
                        points={pointsStr}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3.5 : 2.5}
                        strokeDasharray={!isEnabled ? "6 4" : undefined}
                      />
                    )}

                    {/* Fence Label Tag */}
                    <g transform={`translate(${firstPt[0] * 1000 + 8}, ${firstPt[1] * 562.5 - 8})`}>
                      <rect
                        x="-4"
                        y="-14"
                        width={Math.max(80, (z.name.length + 8) * 7.5)}
                        height="18"
                        rx="4"
                        fill="rgba(15, 23, 42, 0.85)"
                        stroke={strokeColor}
                        strokeWidth="1"
                      />
                      <text
                        x="2"
                        y="-1"
                        fill="#f8fafc"
                        fontSize="10.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {z.name} {!isEnabled ? "[DISABLED]" : `[${z.zone_kind}]`}
                      </text>
                    </g>

                    {/* Direction Arrow on Line Fences */}
                    {isLine && z.polygon.length >= 2 && (
                      <g
                        transform={`translate(${((firstPt[0] + lastPt[0]) / 2) * 1000}, ${
                          ((firstPt[1] + lastPt[1]) / 2) * 562.5
                        })`}
                      >
                        <circle r="10" fill="rgba(15, 23, 42, 0.85)" stroke={strokeColor} strokeWidth="1.5" />
                        <text
                          x="-6"
                          y="3"
                          fill="#ffffff"
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {z.crossing_direction === "both" ? "⇄" : z.crossing_direction === "inbound" ? "→" : "←"}
                        </text>
                      </g>
                    )}

                    {/* Draggable Vertex Control Handles (When Zone Selected in Edit Mode) */}
                    {isSelected &&
                      drawMode === "none" &&
                      z.polygon.map((pt: [number, number], vIdx: number) => (
                        <circle
                          key={`vertex_${vIdx}`}
                          cx={pt[0] * 1000}
                          cy={pt[1] * 562.5}
                          r="7"
                          fill="#ffffff"
                          stroke={strokeColor}
                          strokeWidth="2.5"
                          className="cursor-move hover:scale-125 transition-transform"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsDraggingVertex(vIdx);
                          }}
                        />
                      ))}
                  </g>
                );
              })}

              {/* B. Render AI Suggestions (Pink Dashed) */}
              {aiSuggestions.map((sugg) => {
                if (!sugg.polygon || sugg.polygon.length < 2) return null;
                const pointsStr = sugg.polygon
                  .map((pt: [number, number]) => `${pt[0] * 1000},${pt[1] * 562.5}`)
                  .join(" ");
                const isLine = sugg.zone_kind === "LINE";
                const firstPt = sugg.polygon[0];

                return (
                  <g key={`ai_${sugg.id}`} className="cursor-pointer group">
                    {isLine ? (
                      <polyline
                        points={pointsStr}
                        fill="none"
                        stroke="#ec4899"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                      />
                    ) : (
                      <polygon
                        points={pointsStr}
                        fill="rgba(236, 72, 153, 0.15)"
                        stroke="#ec4899"
                        strokeWidth="2.5"
                        strokeDasharray="6 4"
                      />
                    )}
                    <g transform={`translate(${firstPt[0] * 1000 + 8}, ${firstPt[1] * 562.5 - 6})`}>
                      <rect x="-4" y="-12" width="130" height="16" rx="3" fill="rgba(15, 23, 42, 0.9)" stroke="#ec4899" strokeWidth="1" />
                      <text x="2" y="0" fill="#f472b6" fontSize="9" fontFamily="monospace" fontWeight="bold">
                        AI: {sugg.label}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* C. Render Current In-Progress Drawing Points */}
              {drawMode !== "none" && currentPoints.length > 0 && (
                <g>
                  {/* Lines between existing points */}
                  <polyline
                    points={currentPoints
                      .map((p) => `${p.x * 1000},${p.y * 562.5}`)
                      .join(" ")}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeDasharray="4 2"
                  />

                  {/* Dynamic rubber-band line to cursor */}
                  {cursorPos && (
                    <line
                      x1={currentPoints[currentPoints.length - 1].x * 1000}
                      y1={currentPoints[currentPoints.length - 1].y * 562.5}
                      x2={cursorPos.x * 1000}
                      y2={cursorPos.y * 562.5}
                      stroke="#34d399"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                  )}

                  {/* Polygon closing guideline to start point */}
                  {drawMode === "polygon" && currentPoints.length >= 2 && cursorPos && (
                    <line
                      x1={cursorPos.x * 1000}
                      y1={cursorPos.y * 562.5}
                      x2={currentPoints[0].x * 1000}
                      y2={currentPoints[0].y * 562.5}
                      stroke="rgba(52, 211, 153, 0.4)"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Points circles */}
                  {currentPoints.map((p, idx) => (
                    <circle
                      key={`pt_${idx}`}
                      cx={p.x * 1000}
                      cy={p.y * 562.5}
                      r={idx === 0 && drawMode === "polygon" && currentPoints.length >= 3 ? "8" : "5"}
                      fill={idx === 0 ? "#10b981" : "#ffffff"}
                      stroke="#0f172a"
                      strokeWidth="2"
                    />
                  ))}
                </g>
              )}
            </svg>

            {/* Top Status Pill on Feed */}
            <div className="absolute top-3 left-3 z-30 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-1 flex items-center space-x-2.5 shadow-lg text-[11px] font-mono">
              <span className={`w-2 h-2 rounded-full ${isCamOnline ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
              <span className="text-white font-bold">{activeCamObj?.code || selectedCameraId}</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-300">{activeCamObj?.name || "Perimeter Unit"}</span>
              <span className="text-slate-400">•</span>
              <span className="text-emerald-400 font-semibold">
                {zones.filter((z) => z.status === "CONFIRMED" || z.status === "active").length} Active Fence(s)
              </span>
            </div>

            {/* Bottom Floating Info Pill */}
            <div className="absolute bottom-3 left-3 z-30 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] font-mono text-slate-300">
              Normalized Coords (0.0-1.0) &bull; Viewport: 1000&times;562.5 &bull; Aspect Ratio Locked 16:9
            </div>
          </div>
        </div>

        {/* Right Col: Fence Configuration Form & List */}
        <div className="bg-slate-900 p-4 flex flex-col h-full overflow-y-auto border-l border-slate-800">
          {/* AI Suggestions Drawer */}
          {aiSuggestions.length > 0 && (
            <div className="mb-4 p-3.5 bg-pink-950/30 border border-pink-500/40 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Boundary Proposals ({aiSuggestions.length})</span>
                </span>
                <button
                  onClick={() => setAiSuggestions([])}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  Dismiss
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {aiSuggestions.map((sugg) => (
                  <div
                    key={sugg.id}
                    className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{sugg.label}</p>
                      <p className="text-[10px] font-mono text-slate-400">
                        Confidence: {(sugg.confidence * 100).toFixed(0)}% &bull; {sugg.zone_kind} &bull; {sugg.boundary_type}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAcceptSuggestion(sugg)}
                      className="px-2.5 py-1 bg-pink-600 hover:bg-pink-500 text-white text-[11px] font-semibold rounded-md transition cursor-pointer shrink-0"
                    >
                      Accept &amp; Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected Fence Configuration Panel */}
          {selectedZone ? (
            <div className="p-4 bg-slate-950 border border-slate-700/80 rounded-xl space-y-3.5 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center space-x-2">
                  <div className="p-1 rounded bg-emerald-500/20 text-emerald-400">
                    <Edit3 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Configure Selected Fence
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleToggleEnable(selectedZone)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition flex items-center gap-1 cursor-pointer ${
                      fenceForm.enabled
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>{fenceForm.enabled ? "ENABLED" : "DISABLED"}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Fence Name */}
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wide mb-1">
                    Fence / Zone Name
                  </label>
                  <input
                    type="text"
                    value={fenceForm.name}
                    onChange={(e) => setFenceForm({ ...fenceForm, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>

                {/* Zone Kind & Zone Type */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wide mb-1">
                      Fence Geometry
                    </label>
                    <select
                      value={fenceForm.zone_kind}
                      onChange={(e) => setFenceForm({ ...fenceForm, zone_kind: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs"
                    >
                      <option value="LINE">Line Fence (Tripwire)</option>
                      <option value="POLYGON">Polygon Zone (Area)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wide mb-1">
                      Risk Classification
                    </label>
                    <select
                      value={fenceForm.zone_type}
                      onChange={(e) => setFenceForm({ ...fenceForm, zone_type: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs"
                    >
                      <option value="restricted">Restricted (High Risk)</option>
                      <option value="warning">Warning (Medium Risk)</option>
                      <option value="monitoring">Monitoring (Advisory)</option>
                    </select>
                  </div>
                </div>

                {/* Direction (if Line Fence) */}
                {fenceForm.zone_kind === "LINE" && (
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wide mb-1">
                      Crossing Direction
                    </label>
                    <select
                      value={fenceForm.crossing_direction}
                      onChange={(e) => setFenceForm({ ...fenceForm, crossing_direction: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-mono"
                    >
                      <option value="both">Both Directions (A ⇄ B)</option>
                      <option value="inbound">Inbound Only (A → B)</option>
                      <option value="outbound">Outbound Only (B → A)</option>
                    </select>
                  </div>
                )}

                {/* Loitering Dwell Time (if Polygon Zone) */}
                {fenceForm.zone_kind === "POLYGON" && (
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wide mb-1">
                      Loitering Dwell Threshold (Seconds)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={fenceForm.dwell_time_seconds}
                      onChange={(e) =>
                        setFenceForm({ ...fenceForm, dwell_time_seconds: Number(e.target.value) || 30 })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                )}

                {/* Monitored Objects */}
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wide mb-1.5">
                    Monitored Target Classes
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                    {["person", "car", "truck", "motorcycle"].map((objType) => {
                      const isChecked = fenceForm.monitored_objects.includes(objType);
                      return (
                        <button
                          key={objType}
                          type="button"
                          onClick={() => toggleMonitoredObject(objType)}
                          className={`px-2 py-1 rounded border text-left flex items-center justify-between transition cursor-pointer ${
                            isChecked
                              ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-300"
                              : "bg-slate-900 border-slate-800 text-slate-400"
                          }`}
                        >
                          <span className="capitalize">{objType}</span>
                          <span className="text-[10px]">{isChecked ? "✓" : "—"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleSaveFormChanges}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center justify-center space-x-1 shadow-md cursor-pointer transition"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Save Configuration</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFence(selectedZone.id)}
                  className="p-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-lg cursor-pointer transition"
                  title="Delete Virtual Fence"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl text-center">
              <p className="text-xs text-slate-400 font-mono">
                Click any fence on the video feed or list below to edit points, direction, or event rules.
              </p>
            </div>
          )}

          {/* Configured Fences Fleet List for Selected Camera */}
          <div className="mt-4 flex-1">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                Configured Fences for {activeCamObj?.code || selectedCameraId} ({zones.length})
              </h3>
            </div>
            {zones.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-800 rounded-xl text-center">
                <p className="text-xs text-slate-500 italic">No virtual fences configured for this camera yet.</p>
                <p className="text-[11px] text-slate-600 mt-1">Use "Add Virtual Fence" or "AI Detect" above.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {zones.map((z) => {
                  const isSelected = selectedZoneId === z.id;
                  const isEnabled = z.status === "CONFIRMED" || z.status === "active";
                  return (
                    <div
                      key={z.id}
                      onClick={() => {
                        setSelectedZoneId(z.id);
                        setSelectedZone(z);
                      }}
                      className={`p-2.5 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? "bg-slate-800 border-sky-500 shadow-md"
                          : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 truncate max-w-[65%]">
                          {z.name}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                            isEnabled
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {isEnabled ? "ACTIVE" : "DISABLED"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1.5">
                        <span>
                          {z.zone_kind || "POLYGON"} &bull; {z.zone_type} {z.zone_kind === "LINE" ? `(${z.crossing_direction || "both"})` : ""}
                        </span>
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleEnable(z)}
                            className="text-slate-400 hover:text-white p-0.5"
                            title={isEnabled ? "Disable fence" : "Enable fence"}
                          >
                            <Power className={`w-3 h-3 ${isEnabled ? "text-emerald-400" : "text-slate-500"}`} />
                          </button>
                          <button
                            onClick={() => handleDeleteFence(z.id)}
                            className="text-slate-500 hover:text-rose-400 p-0.5"
                            title="Delete fence"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
