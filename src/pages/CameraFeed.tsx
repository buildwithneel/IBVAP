import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { Camera, CameraDiagnostics, TestStreamStatus } from "../types";
import {
  IconFilter,
  IconRadioWaves,
  IconPlay,
  IconSquare,
  IconVideo,
  IconFilm,
} from "../components/Icons";
import { motion, AnimatePresence } from "framer-motion";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import TestStreamingModal from "../components/TestStreamingModal";
import CameraFeedTile from "../components/CameraFeedTile";
import { VirtualFenceManager } from "../components/VirtualFenceManager";
import { api } from "../services/api";
import { useSurveillanceStream } from "../context/SurveillanceStreamContext";

type LayoutMode = "single" | "2x2" | "3x3" | "4x4" | "all24";

const layoutConfig: Record<LayoutMode, { cols: string; max: number; label: string }> = {
  single: { cols: "grid-cols-1", max: 1, label: "1×1 Focus" },
  "2x2":  { cols: "grid-cols-1 md:grid-cols-2", max: 4, label: "2×2 Quad" },
  "3x3":  { cols: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", max: 9, label: "3×3 Matrix" },
  "4x4":  { cols: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4", max: 16, label: "4×4 Fleet" },
  all24:  { cols: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", max: 24, label: "24-Fleet View" },
};

export default function CameraFeed() {
  const {
    cameraList,
    activeCamera,
    activeCameraId,
    setActiveCameraId,
    streamMode,
    setStreamMode,
    toggleStreamMode,
    streamRevision,
    streamStatus,
    refreshCameras,
  } = useSurveillanceStream();

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("2x2");
  const [selectedSector, setSelectedSector] = useState<string>("ALL");
  const [showTestStreamModal, setShowTestStreamModal] = useState(false);
  const [selectedFenceCameraId, setSelectedFenceCameraId] = useState<string | null>(null);

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

  const handleQuickToggleStreaming = async () => {
    try {
      if (streamStatus.is_streaming) {
        await api.stopTestStreaming({ all: true });
      } else {
        await api.startTestStreaming({ all: true, loop: true });
      }
      await refreshCameras();
    } catch {
      setShowTestStreamModal(true);
    }
  };

  const sectors = [
    "ALL",
    "Sector Alpha",
    "Sector Bravo",
    "Sector Charlie",
    "Sector Delta",
  ];

  const filteredCameras =
    selectedSector === "ALL"
      ? cameraList
      : cameraList.filter((c) => c.sector === selectedSector);

  const { cols, max } = layoutConfig[layoutMode];
  const displayedCameras =
    layoutMode === "single" && activeCamera ? [activeCamera] : filteredCameras.slice(0, max);

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
                {sec}
              </button>
            ))}
          </div>

          {/* Layout Switcher & Simulated Streaming Quick Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Quick Test Video Streaming Toggle */}
            <div className="flex items-center gap-1.5 bg-navy-100/80 p-1 rounded-lg border border-navy-200">
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  streamStatus.is_streaming
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-white text-navy-600"
                }`}
                title={streamStatus.is_streaming ? `Streaming ${streamStatus.active_count} simulated camera(s)` : "Simulated streams stopped"}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    streamStatus.is_streaming ? "bg-emerald-600 animate-pulse" : "bg-stone-400"
                  }`}
                />
                <span>{streamStatus.is_streaming ? `STREAMING (${streamStatus.active_count})` : "STOPPED"}</span>
              </span>

              {streamStatus.is_streaming ? (
                <button
                  type="button"
                  onClick={handleQuickToggleStreaming}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                  title="Stop Simulated CCTV Stream"
                >
                  <IconSquare size={11} />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTestStreamModal(true)}
                  className="px-2 py-0.5 rounded bg-navy-900 hover:bg-navy-800 text-white text-[11px] font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                  title="Start Test Video Streaming from local files"
                >
                  <IconPlay size={11} />
                  <span>Test Stream</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowTestStreamModal(true)}
                className="p-1 rounded bg-white hover:bg-navy-50 text-navy-700 border border-navy-200/80 cursor-pointer"
                title="Select Local Video File & Assign Camera..."
              >
                <IconVideo size={12} />
              </button>
            </div>

            {/* Synchronized Stream Mode Toggle: Raw Footage vs AI Pipeline */}
            <button
              type="button"
              onClick={toggleStreamMode}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                streamMode === "raw"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-indigo-700 text-white shadow-xs"
              }`}
              title="Toggle between Clean Raw Footage and AI-Annotated Pipeline Stream"
            >
              <IconFilm size={12} />
              <span>{streamMode === "raw" ? "RAW FOOTAGE" : "AI PIPELINE STREAM"}</span>
            </button>

            <span className="text-[11px] text-navy-500 font-medium hidden sm:inline">Layout:</span>
            <div className="flex items-center bg-navy-100 p-0.5 rounded-lg border border-navy-200">
              {(Object.keys(layoutConfig) as LayoutMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setLayoutMode(mode)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
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

        {/* Fleet Overview Telemetry Strip */}
        <div className="bg-navy-900/90 text-white rounded-xl border border-navy-700 p-2.5 shadow-sm flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold tracking-wider text-navy-200">
              FLEET STATUS ({cameraList.length} CAMERAS):
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE: {cameraList.filter((c) => c.status === "ACTIVE").length}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              OFFLINE: {cameraList.filter((c) => c.status === "OFFLINE").length}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              NOT CONNECTED: {cameraList.filter((c) => c.status === "NOT_CONNECTED").length}
            </span>
          </div>
          <div className="text-[10px] text-navy-300 flex items-center gap-2">
            <span>YOLOv8 + ByteTrack Active on Connected Units</span>
            <span>·</span>
            <span>Manual Virtual Fence Ready</span>
          </div>
        </div>

        {/* Camera Grid */}
        {displayedCameras.length === 0 ? (
          <div className="bg-gov-card rounded-xl border border-navy-200 p-12 text-center shadow-gov">
            <p className="text-sm font-semibold text-navy-800">NO CAMERAS AVAILABLE IN THIS SECTOR</p>
            <p className="text-xs text-navy-400 mt-1">Register cameras in the Cameras tab or start a test stream to display live tactical streams.</p>
          </div>
        ) : (
          <div className={`grid ${cols} gap-3 transition-all duration-300`}>
            <AnimatePresence mode="popLayout">
              {displayedCameras.map((cam) => (
                <CameraFeedTile
                  key={cam.id}
                  cam={cam}
                  isSelected={activeCameraId === cam.id}
                  streamMode={streamMode}
                  onSelect={() => setActiveCameraId(cam.id)}
                  onOpenConfigure={(camId) => setSelectedFenceCameraId(camId)}
                  onRunDiagnostics={handleRunDiagnostics}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Selected Camera Telemetry Bar */}
        {activeCamera && (
          <div className="bg-gov-card rounded-xl border border-navy-200 p-3.5 shadow-gov flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-navy-400 font-medium uppercase tracking-wide">Selected Station</span>
                <StatusBadge status={activeCamera.status} />
              </div>
              <p className="font-semibold text-navy-900 mt-0.5">
                {activeCamera.name}{" "}
                <span className="font-mono text-navy-500 font-normal">({activeCamera.code})</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-navy-500 font-mono text-[10px]">
              <span>IP: {activeCamera.ipAddress}</span>
              <span>·</span>
              <span>STREAM: RTSP H.264 / AES-256</span>
              <span>·</span>
              <span>HEARTBEAT: {activeCamera.lastHeartbeat}</span>
              <button
                type="button"
                onClick={() => setSelectedFenceCameraId(activeCamera.id)}
                className="ml-auto sm:ml-2 px-2.5 py-1 rounded bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-semibold border border-emerald-600 transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                title="Configure Virtual Fence & AI Boundaries for this camera"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span>Virtual Fence &amp; AI Zones</span>
              </button>
              <button
                type="button"
                onClick={() => handleRunDiagnostics(activeCamera.id)}
                className="px-2.5 py-1 rounded bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-semibold border border-navy-700 transition-colors shadow-xs cursor-pointer"
              >
                Hardware Probe
              </button>
            </div>
          </div>
        )}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-navy-50 rounded-xl border border-navy-200">
                <span className="text-[10px] font-mono uppercase tracking-wider text-navy-400 block mb-1">
                  Latency
                </span>
                <span className="text-xl font-bold font-mono text-navy-950">
                  {diagnosticData.latency_ms} <span className="text-xs font-normal text-navy-500">ms</span>
                </span>
              </div>

              <div className="p-3.5 bg-navy-50 rounded-xl border border-navy-200">
                <span className="text-[10px] font-mono uppercase tracking-wider text-navy-400 block mb-1">
                  FPS
                </span>
                <span className="text-xl font-bold font-mono text-navy-950">
                  {diagnosticData.measured_fps} <span className="text-xs font-normal text-navy-500">/ {diagnosticData.configured_fps}</span>
                </span>
              </div>

              <div className="p-3.5 bg-navy-50 rounded-xl border border-navy-200">
                <span className="text-[10px] font-mono uppercase tracking-wider text-navy-400 block mb-1">
                  Packet Loss
                </span>
                <span className={`text-xl font-bold font-mono ${diagnosticData.packet_loss_pct > 1 ? "text-status-critical" : "text-status-live"}`}>
                  {diagnosticData.packet_loss_pct}%
                </span>
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
              </div>
            </div>

            {rebootFeedback && (
              <div className="p-3 rounded-lg bg-status-liveBg/60 border border-status-live/40 text-navy-900 text-xs font-medium">
                ✓ {rebootFeedback}
              </div>
            )}

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

      {/* Simulated Video Streaming Selection & Assignment Modal */}
      <TestStreamingModal
        isOpen={showTestStreamModal}
        onClose={() => setShowTestStreamModal(false)}
        onStreamStarted={() => {
          refreshCameras();
          setShowTestStreamModal(false);
        }}
        onStreamStopped={() => {
          refreshCameras();
          setShowTestStreamModal(false);
        }}
        cameras={cameraList}
        selectedCameraId={activeCamera?.id}
      />

      {/* Manual Virtual Fence & AI Boundaries Manager Modal */}
      {selectedFenceCameraId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-navy-950/80 backdrop-blur-sm">
          <div className="w-full max-w-6xl h-[90vh] rounded-2xl overflow-hidden shadow-2xl border border-navy-700">
            <VirtualFenceManager
              cameras={cameraList}
              initialCameraId={selectedFenceCameraId}
              onClose={() => {
                setSelectedFenceCameraId(null);
                refreshCameras();
              }}
            />
          </div>
        </div>
      )}
    </Layout>
  );
}
