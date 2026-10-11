import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { Camera, DetectionItem, BackendEventResponse } from "../types";
import { IconAnalysis, IconCamera, IconFilm, IconVideo } from "../components/Icons";
import StatusBadge from "../components/StatusBadge";
import EvidenceModal, { EvidenceModalData } from "../components/EvidenceModal";
import TestStreamingModal from "../components/TestStreamingModal";
import { VirtualFenceManager } from "../components/VirtualFenceManager";
import { api } from "../services/api";
import { useSurveillanceStream } from "../context/SurveillanceStreamContext";

const typeStyle: Record<string, { badge: string; label: string }> = {
  breach:  { badge: "bg-status-critical text-white", label: "BREACH" },
  person:  { badge: "bg-navy-700 text-white",        label: "PERSON" },
  vehicle: { badge: "bg-status-info text-white",     label: "VEHICLE" },
  object:  { badge: "bg-status-warn text-white",     label: "OBJECT" },
};

export default function SurveillanceAnalysis() {
  const navigate = useNavigate();
  const [isFenceModalOpen, setIsFenceModalOpen] = useState(false);
  const {
    cameraList: contextCameras,
    activeCamera: streamActiveCam,
    activeCameraId,
    setActiveCameraId,
    streamMode,
    toggleStreamMode,
    streamRevision,
    refreshCameras,
  } = useSurveillanceStream();

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


  const [activeTab, setActiveTab] = useState<"anpr_events" | "detections">("anpr_events");
  const [detections, setDetections] = useState<DetectionItem[]>([]);
  const [events, setEvents] = useState<BackendEventResponse[]>([]);
  const [localCameras, setLocalCameras] = useState<Camera[]>([]);
  const [selectedDetection, setSelectedDetection] = useState<DetectionItem | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<BackendEventResponse | null>(null);
  const [evidenceModalData, setEvidenceModalData] = useState<EvidenceModalData | null>(null);
  const [detectionFilter, setDetectionFilter] = useState<"ALL" | "person" | "vehicle" | "breach">("ALL");
  const [anprFilter, setAnprFilter] = useState<"ALL" | "ANPR_ONLY" | "ALERTS">("ALL");
  const [plateQuery, setPlateQuery] = useState("");
  const [timestamp, setTimestamp] = useState("");

  // Dual camera viewport states with persistence
  const [viewLayout, setViewLayout] = useState<"single" | "dual">("single");
  const [primaryCameraId, setPrimaryCameraId] = useState<string>(() => {
    return localStorage.getItem("ibvap_surveillance_cam1") || "";
  });
  const [secondaryCameraId, setSecondaryCameraId] = useState<string>(() => {
    return localStorage.getItem("ibvap_surveillance_cam2") || "";
  });
  const [focusedSlot, setFocusedSlot] = useState<1 | 2>(1);
  const [isStreamingModalOpen, setIsStreamingModalOpen] = useState(false);

  const cameraList = contextCameras && contextCameras.length > 0 ? contextCameras : localCameras;

  const loadAnalysisData = async () => {
    try {
      const [detsRes, camsRes, eventsRes] = await Promise.allSettled([
        api.getDetections(),
        api.getCameras(),
        api.getEvents({ limit: 100 }),
      ]);

      if (camsRes.status === "fulfilled" && camsRes.value) {
        setLocalCameras(camsRes.value);
      }
      if (detsRes.status === "fulfilled" && detsRes.value && detsRes.value.length > 0) {
        setDetections(detsRes.value);
        if (!selectedDetection) setSelectedDetection(detsRes.value[0]);
      }
      if (eventsRes.status === "fulfilled" && eventsRes.value) {
        setEvents(eventsRes.value);
        if (!selectedEvent && eventsRes.value.length > 0) {
          setSelectedEvent(eventsRes.value[0]);
        }
      }
    } catch (e) {
      console.warn("Error loading surveillance analysis data:", e);
    }
  };

  useEffect(() => {
    let isMounted = true;
    loadAnalysisData();
    const interval = setInterval(loadAnalysisData, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const activeCamera =
    (primaryCameraId ? cameraList.find((c) => c.id === primaryCameraId) : null) ||
    (activeCameraId ? cameraList.find((c) => c.id === activeCameraId) : null) ||
    streamActiveCam ||
    (selectedEvent && cameraList.find((c) => c.id === selectedEvent.camera_id)) ||
    (selectedDetection && cameraList.find((c) => c.id === selectedDetection.cameraId)) ||
    cameraList[0];

  const secondaryCamera =
    (secondaryCameraId ? cameraList.find((c) => c.id === secondaryCameraId && c.id !== activeCamera?.id) : null) ||
    cameraList.find((c) => c.id !== activeCamera?.id) ||
    (cameraList.length > 1 ? cameraList[1] : null);

  const handleSelectSlot1 = (camId: string) => {
    setPrimaryCameraId(camId);
    localStorage.setItem("ibvap_surveillance_cam1", camId);
    setActiveCameraId(camId);
    if (secondaryCameraId === camId) {
      const other = cameraList.find((c) => c.id !== camId);
      if (other) {
        setSecondaryCameraId(other.id);
        localStorage.setItem("ibvap_surveillance_cam2", other.id);
      }
    }
  };

  const handleSelectSlot2 = (camId: string) => {
    setSecondaryCameraId(camId);
    localStorage.setItem("ibvap_surveillance_cam2", camId);
    if (primaryCameraId === camId || activeCamera?.id === camId) {
      const other = cameraList.find((c) => c.id !== camId);
      if (other) {
        setPrimaryCameraId(other.id);
        localStorage.setItem("ibvap_surveillance_cam1", other.id);
        setActiveCameraId(other.id);
      }
    }
  };

  const filteredDetections =
    detectionFilter === "ALL"
      ? detections
      : detections.filter((d) => d.type === detectionFilter);

  const filteredEvents = events.filter((ev) => {
    const isAnpr =
      ev.event_type?.includes("ANPR") ||
      ev.event_type?.includes("PLATE") ||
      Boolean(ev.plate_number || ev.plate_image_url);

    if (anprFilter === "ANPR_ONLY" && !isAnpr) return false;
    if (anprFilter === "ALERTS" && isAnpr) return false;

    if (plateQuery.trim()) {
      const q = plateQuery.trim().toLowerCase();
      const p = (ev.plate_number || ev.extra_data?.plate_number || "").toLowerCase();
      const title = (ev.title || "").toLowerCase();
      if (!p.includes(q) && !title.includes(q)) return false;
    }
    return true;
  });

  useEffect(() => {
    const update = () => {
      const n = new Date();
      setTimestamp(
        n.toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " IST"
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const handleOpenEvidence = (ev: BackendEventResponse) => {
    setEvidenceModalData({
      eventId: ev.id,
      evidenceId: ev.extra_data?.evidence_id,
      plateNumber: ev.plate_number || ev.extra_data?.plate_number,
      confidence: ev.extra_data?.confidence,
      cameraCode: ev.camera_name || `CAM-${ev.camera_id.slice(-4)}`,
      cameraName: ev.camera_name,
      sector: ev.sector,
      timestamp: ev.timestamp
        ? new Date(ev.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : undefined,
      plateImageUrl: ev.plate_image_url || ev.extra_data?.plate_image_url,
      snapshotUrl: ev.snapshot_url || ev.extra_data?.snapshot_url,
      plateSha256: ev.extra_data?.plate_sha256,
      snapshotSha256: ev.extra_data?.snapshot_sha256,
      captureStatus: ev.evidence_status || ev.extra_data?.capture_status || (ev.plate_image_url ? "SUCCESS" : "FAILED"),
      details: ev.description,
    });
  };

  const renderFeedCanvas = (cam: Camera | null, slotLabel: string, isFocused: boolean, slotNum: 1 | 2 = 1) => {
    if (!cam) {
      return (
        <div className="relative aspect-video w-full bg-navy-950 overflow-hidden flex flex-col items-center justify-center p-4 text-center">
          <span className="text-xs font-mono text-navy-400 mb-2">No camera feed assigned to {slotLabel}</span>
          <button
            onClick={() => {
              setFocusedSlot(slotNum);
              setIsStreamingModalOpen(true);
            }}
            className="px-2.5 py-1 rounded bg-navy-800 text-white text-[11px] font-mono hover:bg-navy-700 transition-colors cursor-pointer"
          >
            + Assign Video Stream
          </button>
        </div>
      );
    }

    return (
      <div
        className={`relative aspect-video w-full bg-navy-950 overflow-hidden select-none cursor-pointer transition-all ${
          isFocused ? "ring-2 ring-indigo-500/50" : ""
        }`}
        onClick={() => {
          setFocusedSlot(slotNum);
          if (slotNum === 1) {
            handleSelectSlot1(cam.id);
          } else {
            handleSelectSlot2(cam.id);
          }
        }}
      >
        {streamMode === "raw" ? (
          cam.isSimulated && cam.videoUrl ? (
            <video
              key={`raw-vid-${cam.id}-${cam.videoUrl}-${streamRevision}`}
              src={cam.videoUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover z-0"
            />
          ) : (
            <img
              key={`raw-img-${cam.id}-${cam.streamUrl}-${streamRevision}`}
              src={`${api.getRawMjpegStreamUrl(cam.id)}?v=${encodeURIComponent(cam.streamUrl || "")}&rev=${streamRevision}`}
              alt={`Raw live analysis feed ${cam.name}`}
              className="w-full h-full object-cover z-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          )
        ) : (
          <img
            key={`pipe-img-${cam.id}-${cam.streamUrl}-${streamRevision}`}
            src={`${api.getMjpegStreamUrl(cam.id)}?v=${encodeURIComponent(cam.streamUrl || "")}&rev=${streamRevision}`}
            alt={`Live analysis feed ${cam.name}`}
            className="w-full h-full object-cover z-0"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        )}

        {/* Background Grid */}
        <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-slate-900 to-navy-950 pointer-events-none -z-10">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
            <div className="w-12 h-12 border border-white/50 rounded-full" />
            <div className="absolute w-16 h-px bg-white/30" />
            <div className="absolute h-16 w-px bg-white/30" />
          </div>
        </div>

        {/* Slot Identifier Watermark */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-black/70 text-white border border-white/20">
            {slotLabel}
          </span>
          {isFocused && (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-indigo-600 text-white">
              INSPECTING
            </span>
          )}
        </div>

        {/* OSD Telemetry bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-2.5 flex items-center justify-between text-[10px] font-mono text-navy-300 bg-black/75 border-t border-white/10 z-10">
          <div className="flex items-center gap-2 truncate">
            <span className="text-white font-bold">{cam.code}</span>
            <span>·</span>
            <span className="truncate">{cam.sector}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-amber-300 font-semibold">{cam.fps || 25} FPS</span>
            <span>·</span>
            <span>{timestamp}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout
      title="Surveillance Analysis & ANPR Forensic Intelligence"
      subtitle="Automated Number Plate Recognition, Object Classification & Cryptographic Evidence Vault"
    >
      <div className="space-y-4">
        {/* Model Status Banner */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-3.5 shadow-gov flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-navy-100 text-navy-800">
              <IconAnalysis size={16} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-navy-900">
                Surveillance Neural Engine & Automated Plate Recognition
              </p>
              <p className="text-[10px] text-navy-500 font-mono mt-0.5">
                Engine: YOLOv8 / ByteTrack / EasyOCR / PyTesseract &nbsp;|&nbsp; SHA-256 Custody Integrity: Active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Viewport Layout Mode Controls */}
            <div className="flex items-center gap-1 bg-navy-100 p-0.5 rounded-lg border border-navy-200">
              <button
                type="button"
                onClick={() => setViewLayout("single")}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  viewLayout === "single" ? "bg-navy-900 text-white shadow-2xs" : "text-navy-600 hover:text-navy-900"
                }`}
              >
                1-UP SINGLE
              </button>
              <button
                type="button"
                onClick={() => setViewLayout("dual")}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  viewLayout === "dual" ? "bg-navy-900 text-white shadow-2xs" : "text-navy-600 hover:text-navy-900"
                }`}
              >
                2-UP DUAL
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsFenceModalOpen(true)}
              className="px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Configure Virtual Fence, Zones & AI Boundaries"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>Virtual Fence</span>
            </button>

            <button
              type="button"
              onClick={() => setIsStreamingModalOpen(true)}
              className="px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-navy-900 hover:bg-navy-800 text-white flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <IconVideo size={12} />
              <span>+ Add / Stream Camera</span>
            </button>

            <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
              ANPR EVIDENCE PIPELINE: ONLINE
            </span>
            <StatusBadge status="ACTIVE" label="PIPELINE ACTIVE" />
          </div>
        </div>

        {/* Main Split: Viewport + Telemetry / Events */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left 7: Analysis Viewport & Forensic Preview */}
          <div className="lg:col-span-7 space-y-3">
            {viewLayout === "dual" && cameraList.length >= 2 ? (
              /* Dual Camera Viewport Grid (Independent video feeds for Slot 1 and Slot 2) */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Slot 1: Primary Camera */}
                <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
                  <div className="px-3 py-2 border-b border-navy-200 bg-navy-50 flex items-center justify-between gap-1 text-xs">
                    <span className="font-bold text-navy-900 uppercase tracking-wide truncate text-[11px]">
                      Slot 1: {activeCamera?.code || "CAM-01"}
                    </span>
                    <select
                      value={activeCamera?.id || ""}
                      onChange={(e) => handleSelectSlot1(e.target.value)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-white border border-navy-200 text-navy-800 max-w-[120px]"
                    >
                      {cameraList.map((c) => (
                        <option key={c.id} value={c.id} disabled={c.id === secondaryCamera?.id}>
                          {c.code} ({c.name.slice(0, 14)})
                        </option>
                      ))}
                    </select>
                  </div>
                  {renderFeedCanvas(activeCamera, "SLOT 1 (PRIMARY)", focusedSlot === 1, 1)}
                </div>

                {/* Slot 2: Secondary Camera */}
                <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
                  <div className="px-3 py-2 border-b border-navy-200 bg-navy-50 flex items-center justify-between gap-1 text-xs">
                    <span className="font-bold text-navy-900 uppercase tracking-wide truncate text-[11px]">
                      Slot 2: {secondaryCamera?.code || "CAM-02"}
                    </span>
                    <select
                      value={secondaryCamera?.id || ""}
                      onChange={(e) => handleSelectSlot2(e.target.value)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-white border border-navy-200 text-navy-800 max-w-[120px]"
                    >
                      {cameraList.map((c) => (
                        <option key={c.id} value={c.id} disabled={c.id === activeCamera?.id}>
                          {c.code} ({c.name.slice(0, 14)})
                        </option>
                      ))}
                    </select>
                  </div>
                  {renderFeedCanvas(secondaryCamera, "SLOT 2 (SECONDARY)", focusedSlot === 2, 2)}
                </div>
              </div>
            ) : (
              /* Single Viewport Mode */
              <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
                {/* Viewport Header */}
                <div className="px-4 py-2.5 border-b border-navy-200 bg-navy-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-navy-900 uppercase tracking-wide">
                      Analysis Viewport: {activeCamera?.code || "STATION-01"}
                    </span>
                    {activeCamera && <StatusBadge status={activeCamera.status} size="sm" />}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {cameraList.length > 1 && (
                      <select
                        value={activeCamera?.id || ""}
                        onChange={(e) => handleSelectSlot1(e.target.value)}
                        className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-white border border-navy-200 text-navy-800"
                      >
                        {cameraList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} ({c.name})
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Virtual Fence & AI Boundaries Trigger */}
                    <button
                      type="button"
                      onClick={() => setIsFenceModalOpen(true)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 bg-emerald-800 hover:bg-emerald-700 text-white cursor-pointer"
                      title="Configure Virtual Fence and AI boundaries for this camera"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      <span>FENCE</span>
                    </button>

                    {/* Synchronized Stream Mode Toggle */}
                    <button
                      type="button"
                      onClick={toggleStreamMode}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                        streamMode === "raw" ? "bg-amber-600 text-white" : "bg-indigo-700 text-white"
                      }`}
                      title="Toggle between Clean Raw Footage and AI-Annotated Pipeline Stream"
                    >
                      <IconFilm size={11} />
                      <span>{streamMode === "raw" ? "RAW FOOTAGE" : "PIPELINE STREAM"}</span>
                    </button>

                    {/* Instant Snapshot Capture Button */}
                    <button
                      type="button"
                      onClick={handleCaptureSnapshot}
                      disabled={isCapturingSnapshot || !activeCamera}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors flex items-center gap-1 bg-sky-700 hover:bg-sky-600 text-white cursor-pointer disabled:opacity-50"
                      title="Capture instantaneous forensic frame snapshot with SHA-256 integrity"
                    >
                      <IconCamera size={11} />
                      <span>{isCapturingSnapshot ? "CAPTURING..." : "SNAPSHOT"}</span>
                    </button>

                    <div className="flex items-center gap-1.5 font-mono text-navy-400">
                      <span>{activeCamera?.postNumber || "BP-01"}</span>
                      <span>·</span>
                      <span>{timestamp}</span>
                    </div>
                  </div>
                </div>

                {/* Instant Snapshot Feedback Toast */}
                {snapshotFeedback && (
                  <div className="px-3 py-1.5 bg-navy-950 border-b border-sky-400/40 text-sky-200 text-xs font-mono flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
                    <span>{snapshotFeedback}</span>
                  </div>
                )}

                {/* Viewport Canvas */}
                {renderFeedCanvas(activeCamera, "PRIMARY FEED", true, 1)}


                {/* Viewport Footer Bar */}
                <div className="px-4 py-2 border-t border-navy-200 bg-navy-950 text-white font-mono text-[11px] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedEvent ? (
                      <>
                        <span>EVENT: {selectedEvent.event_type}</span>
                        {selectedEvent.plate_number && (
                          <span className="text-amber-300 font-bold">PLATE: {selectedEvent.plate_number}</span>
                        )}
                        <span>
                          TS:{" "}
                          {selectedEvent.timestamp
                            ? new Date(selectedEvent.timestamp).toLocaleTimeString("en-IN")
                            : "NOW"}
                        </span>
                      </>
                    ) : selectedDetection ? (
                      <>
                        <span>TARGET: {selectedDetection.label}</span>
                        <span>CONF: {Math.round(selectedDetection.confidence * 100)}%</span>
                        <span>TS: {selectedDetection.timestamp}</span>
                      </>
                    ) : (
                      <span>STANDBY • AWAITING DETECTIONS</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Inspection Summary Card */}
            {selectedEvent ? (
              <div className="bg-gov-card rounded-xl border border-navy-200 p-4 shadow-gov space-y-3">
                <div className="flex items-center justify-between border-b border-navy-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-navy-800 font-mono">
                      Event Forensic Inspection
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-navy-500 bg-navy-100 px-2 py-0.5 rounded border border-navy-200">
                      {selectedEvent.id}
                    </span>
                    <button
                      onClick={() => handleOpenEvidence(selectedEvent)}
                      className="px-3 py-1 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <span>Inspect Evidence Dossier</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>

                {/* Evidence Thumbnails Row if ANPR */}
                {(selectedEvent.plate_image_url || selectedEvent.snapshot_url || selectedEvent.plate_number) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-navy-50 rounded-xl border border-navy-200/80">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold text-navy-500 uppercase block">
                        Cropped Number Plate
                      </span>
                      <div
                        onClick={() => handleOpenEvidence(selectedEvent)}
                        className="h-20 bg-black rounded-lg border border-navy-300 flex items-center justify-center p-1 overflow-hidden cursor-pointer hover:border-amber-400 transition-colors"
                      >
                        {selectedEvent.plate_image_url ? (
                          <img
                            src={selectedEvent.plate_image_url}
                            alt={`Plate ${selectedEvent.plate_number}`}
                            className="max-h-full max-w-full object-contain filter contrast-125"
                          />
                        ) : (
                          <span className="text-xs font-mono font-bold text-amber-300">
                            {selectedEvent.plate_number || "NO CROP AVAILABLE"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold text-navy-500 uppercase block">
                        Vehicle Context Snapshot
                      </span>
                      <div
                        onClick={() => handleOpenEvidence(selectedEvent)}
                        className="h-20 bg-black rounded-lg border border-navy-300 flex items-center justify-center p-1 overflow-hidden cursor-pointer hover:border-amber-400 transition-colors"
                      >
                        {selectedEvent.snapshot_url ? (
                          <img
                            src={selectedEvent.snapshot_url}
                            alt="Vehicle Frame"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] font-mono text-navy-400">
                            Snapshot Frame Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">Event Type</span>
                    <span className="font-semibold font-mono text-navy-900">{selectedEvent.event_type}</span>
                  </div>
                  <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">Plate Number</span>
                    <span className="font-bold font-mono text-amber-800">
                      {selectedEvent.plate_number || "N/A"}
                    </span>
                  </div>
                  <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">Camera</span>
                    <span className="font-semibold text-navy-900 truncate block">
                      {selectedEvent.camera_name || selectedEvent.camera_id}
                    </span>
                  </div>
                  <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">Capture Status</span>
                    <span
                      className={`font-mono font-bold ${
                        selectedEvent.evidence_status === "SUCCESS"
                          ? "text-emerald-700"
                          : selectedEvent.evidence_status === "FAILED"
                          ? "text-rose-600"
                          : "text-navy-700"
                      }`}
                    >
                      {selectedEvent.evidence_status || "RECORDED"}
                    </span>
                  </div>
                </div>

                {selectedEvent.description && (
                  <div className="p-2.5 bg-navy-50 rounded-lg border border-navy-200/60">
                    <span className="text-[10px] text-navy-400 font-semibold uppercase block mb-1">
                      Event Summary
                    </span>
                    <p className="text-xs text-navy-700 leading-relaxed">{selectedEvent.description}</p>
                  </div>
                )}
              </div>
            ) : selectedDetection ? (
              <div className="bg-gov-card rounded-xl border border-navy-200 p-4 shadow-gov">
                <div className="flex items-center justify-between border-b border-navy-100 pb-2.5 mb-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-navy-700">
                    Detection Summary
                  </h3>
                  <span className="text-[10px] font-mono text-navy-500 bg-navy-100 px-2 py-0.5 rounded border border-navy-200">
                    {selectedDetection.id}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">Classification</span>
                    <span className="font-semibold text-navy-900">{selectedDetection.type.toUpperCase()}</span>
                  </div>
                  <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">Confidence</span>
                    <span className="font-mono font-semibold text-navy-900">
                      {(selectedDetection.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">Sector</span>
                    <span className="font-semibold text-navy-900">{selectedDetection.sector}</span>
                  </div>
                  <div className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">Severity</span>
                    <span
                      className={`font-semibold ${
                        selectedDetection.severity === "critical"
                          ? "text-status-critical font-bold"
                          : selectedDetection.severity === "warn"
                          ? "text-status-warn font-semibold"
                          : "text-status-live"
                      }`}
                    >
                      {selectedDetection.severity}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Right 5: Dual Log Interface (ANPR Events Log vs ByteTrack Detections) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
              {/* Tab Header */}
              <div className="px-3.5 py-2.5 border-b border-navy-200 bg-navy-50 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 bg-navy-200/80 p-0.5 rounded-lg">
                  <button
                    onClick={() => setActiveTab("anpr_events")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                      activeTab === "anpr_events"
                        ? "bg-navy-900 text-white shadow-xs"
                        : "text-navy-700 hover:text-navy-900"
                    }`}
                  >
                    ANPR &amp; Events ({events.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("detections")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                      activeTab === "detections"
                        ? "bg-navy-900 text-white shadow-xs"
                        : "text-navy-700 hover:text-navy-900"
                    }`}
                  >
                    Detections ({detections.length})
                  </button>
                </div>

                {activeTab === "anpr_events" ? (
                  <div className="flex items-center gap-1">
                    {(["ALL", "ANPR_ONLY", "ALERTS"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setAnprFilter(f)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono transition-colors ${
                          anprFilter === f
                            ? "bg-navy-800 text-white"
                            : "text-navy-500 hover:bg-navy-200"
                        }`}
                      >
                        {f === "ANPR_ONLY" ? "ANPR" : f}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5">
                    {(["ALL", "breach", "person", "vehicle"] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setDetectionFilter(filter)}
                        className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold transition-colors ${
                          detectionFilter === filter
                            ? "bg-navy-800 text-white"
                            : "text-navy-500 hover:bg-navy-200"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ANPR Search Filter input */}
              {activeTab === "anpr_events" && (
                <div className="p-2 border-b border-navy-100 bg-white">
                  <input
                    type="text"
                    placeholder="Search plate registration or event..."
                    value={plateQuery}
                    onChange={(e) => setPlateQuery(e.target.value)}
                    className="w-full px-2.5 py-1 text-xs rounded-lg border border-navy-200 bg-stone-50 font-mono text-navy-800 placeholder-navy-400 outline-hidden focus:border-navy-400"
                  />
                </div>
              )}

              {/* Tab 1: ANPR & Surveillance Events Log */}
              {activeTab === "anpr_events" ? (
                <div className="divide-y divide-navy-100 max-h-[600px] overflow-y-auto">
                  {filteredEvents.length === 0 ? (
                    <div className="p-6 text-center text-xs text-navy-400 font-mono">
                      No surveillance events recorded in database.
                    </div>
                  ) : (
                    filteredEvents.map((ev) => {
                      const isSelected = selectedEvent?.id === ev.id;
                      const hasPlate = Boolean(ev.plate_number || ev.plate_image_url);
                      const isAnprType = ev.event_type?.includes("ANPR") || ev.event_type?.includes("WATCHLIST");

                      return (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className={`p-3 text-xs space-y-2 cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-navy-100 border-l-4 border-l-navy-800"
                              : "hover:bg-navy-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span
                                className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                                  isAnprType
                                    ? "bg-amber-600 text-white"
                                    : "bg-navy-800 text-white"
                                }`}
                              >
                                {ev.event_type}
                              </span>
                              <span className="font-semibold text-navy-900 truncate">
                                {ev.camera_name || `CAM-${ev.camera_id.slice(-4)}`}
                              </span>
                              {ev.plate_number && (
                                <span className="font-mono text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded shadow-2xs">
                                  {ev.plate_number}
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-navy-400 shrink-0">
                              {ev.timestamp
                                ? new Date(ev.timestamp).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })
                                : "NOW"}
                            </span>
                          </div>

                          {/* Plate Crop & Snapshot Preview Strip */}
                          {(ev.plate_image_url || ev.snapshot_url) && (
                            <div className="flex items-center gap-2 pt-0.5">
                              {ev.plate_image_url && (
                                <div className="h-9 w-24 bg-black rounded border border-navy-200 overflow-hidden flex items-center justify-center shrink-0">
                                  <img
                                    src={ev.plate_image_url}
                                    alt="Plate"
                                    className="max-h-full max-w-full object-contain filter contrast-125"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = "none";
                                    }}
                                  />
                                </div>
                              )}
                              {ev.snapshot_url && (
                                <div className="h-9 w-16 bg-black rounded border border-navy-200 overflow-hidden flex items-center justify-center shrink-0">
                                  <img
                                    src={ev.snapshot_url}
                                    alt="Snapshot"
                                    className="max-h-full max-w-full object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = "none";
                                    }}
                                  />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] text-navy-600 truncate leading-snug">
                                  {ev.title || ev.description}
                                </p>
                                <span
                                  className={`text-[9px] font-mono font-bold ${
                                    ev.evidence_status === "SUCCESS" ? "text-emerald-700" : "text-amber-700"
                                  }`}
                                >
                                  {ev.evidence_status === "SUCCESS" ? "✓ EVIDENCE SAVED" : "EVIDENCE ATTACHED"}
                                </span>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-navy-400 font-mono">
                              {ev.sector || "Sector Alpha"}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEvidence(ev);
                              }}
                              className="px-2.5 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold font-mono transition-colors shadow-2xs cursor-pointer"
                            >
                              Inspect Evidence
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* Tab 2: ByteTrack Detections Log */
                <div className="divide-y divide-navy-100 max-h-[600px] overflow-y-auto">
                  {filteredDetections.length === 0 ? (
                    <div className="p-6 text-center text-xs text-navy-400 font-mono">
                      No detections recorded in real-time database.
                    </div>
                  ) : (
                    filteredDetections.map((det) => {
                      const isSelected = selectedDetection?.id === det.id;
                      const ts = typeStyle[det.type] ?? typeStyle.object;
                      const isCrit = det.severity === "critical";

                      return (
                        <div
                          key={det.id}
                          onClick={() => setSelectedDetection(det)}
                          className={`p-3 text-xs space-y-1.5 cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-navy-100 border-l-4 border-l-navy-800"
                              : isCrit
                              ? "bg-status-criticalBg/15 hover:bg-status-criticalBg/30"
                              : "hover:bg-navy-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${ts.badge}`}>
                                {ts.label}
                              </span>
                              <span className="font-semibold text-navy-900 truncate">{det.label}</span>
                            </div>
                            <span className="font-mono text-[10px] text-navy-400 shrink-0">{det.timestamp}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-navy-500">
                            <span>{det.cameraCode} · {det.sector}</span>
                            <span className="font-mono font-bold text-navy-700">{Math.round(det.confidence * 100)}%</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Forensic Evidence Modal */}
      <EvidenceModal
        open={Boolean(evidenceModalData)}
        onClose={() => setEvidenceModalData(null)}
        data={evidenceModalData}
      />

      {/* Test Video Streaming Modal */}
      <TestStreamingModal
        isOpen={isStreamingModalOpen}
        onClose={() => setIsStreamingModalOpen(false)}
        cameras={cameraList}
        selectedCameraId={focusedSlot === 1 ? activeCamera?.id : secondaryCamera?.id}
        onStreamStarted={() => {
          refreshCameras();
          loadAnalysisData();
        }}
      />

      {/* Manual Virtual Fence & AI Boundaries Manager Modal */}
      {isFenceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-navy-950/80 backdrop-blur-sm">
          <div className="w-full max-w-6xl h-[90vh] rounded-2xl overflow-hidden shadow-2xl border border-navy-700">
            <VirtualFenceManager
              cameras={cameraList}
              initialCameraId={activeCamera?.id}
              onClose={() => {
                setIsFenceModalOpen(false);
                loadAnalysisData();
              }}
            />
          </div>
        </div>
      )}
    </Layout>
  );
}
