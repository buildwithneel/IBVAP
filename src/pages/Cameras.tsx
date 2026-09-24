import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { mockCameras } from "../data/mockData";
import { Camera, CameraStatus, BackendCameraCreatePayload, BackendCameraUpdatePayload } from "../types";
import { IconFilter, IconSearch, IconAlertTriangle } from "../components/Icons";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { api } from "../services/api";

const statusCounts = (cameras: Camera[]) => ({
  ALL: cameras.length,
  ACTIVE: cameras.filter((c) => c.status === "ACTIVE").length,
  ALERT: cameras.filter((c) => c.status === "ALERT").length,
  OFFLINE: cameras.filter((c) => c.status === "OFFLINE").length,
  MAINTENANCE: cameras.filter((c) => c.status === "MAINTENANCE").length,
});

interface CameraFormData {
  name: string;
  stream_url: string;
  source_type: string;
  sector: string;
  location: string;
  latitude: number | "";
  longitude: number | "";
  fps: number;
}

const initialFormData: CameraFormData = {
  name: "",
  stream_url: "rtsp://10.142.1.88:554/live/ch0",
  source_type: "rtsp",
  sector: "Sector Alpha",
  location: "BP-01",
  latitude: 34.0837,
  longitude: 74.7973,
  fps: 25,
};

export default function Cameras() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | CameraStatus>("ALL");
  const [cameraList, setCameraList] = useState<Camera[]>(mockCameras);
  const [_isLoading, setIsLoading] = useState(true);

  // Form & Modal States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CameraFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirmation State
  const [deletingCamera, setDeletingCamera] = useState<Camera | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback Notification
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showFeedback = (message: string, type: "success" | "error" = "success") => {
    setFeedback({ message, type });
    setTimeout(() => {
      setFeedback((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  useEffect(() => {
    let isMounted = true;
    async function loadFleet() {
      try {
        setIsLoading(true);
        const [cams] = await Promise.all([
          api.getCameras(),
          api.getCameraHealth(),
        ]);
        if (!isMounted) return;

        if (cams && cams.length > 0) {
          setCameraList(cams);
        }
      } catch (e) {
        console.warn("Using fallback fleet data:", e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadFleet();
    return () => {
      isMounted = false;
    };
  }, []);

  const counts = statusCounts(cameraList);

  const filteredCameras = cameraList.filter((cam) => {
    const matchesSearch =
      cam.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cam.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cam.sector.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cam.ipAddress.includes(searchTerm);
    const matchesStatus = statusFilter === "ALL" || cam.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Action Handlers
  const handleOpenAdd = () => {
    setIsEditMode(false);
    setEditingCameraId(null);
    setFormData({
      ...initialFormData,
      name: "",
      location: `BP-${Math.floor(1000 + Math.random() * 9000)}`,
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (cam: Camera) => {
    setIsEditMode(true);
    setEditingCameraId(cam.id);
    setFormData({
      name: cam.name,
      stream_url: cam.streamUrl || `rtsp://${cam.ipAddress}:554/live`,
      source_type: "rtsp",
      sector: cam.sector,
      location: cam.postNumber || cam.code,
      latitude: 34.0837,
      longitude: 74.7973,
      fps: cam.fps || 25,
    });
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showFeedback("Camera station name is required", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditMode && editingCameraId) {
        const payload: BackendCameraUpdatePayload = {
          name: formData.name,
          stream_url: formData.stream_url,
          source_type: formData.source_type,
          sector: formData.sector,
          location: formData.location,
          latitude: typeof formData.latitude === "number" ? formData.latitude : 0,
          longitude: typeof formData.longitude === "number" ? formData.longitude : 0,
          fps: Number(formData.fps) || 25,
        };
        const updated = await api.updateCamera(editingCameraId, payload);
        setCameraList((prev) =>
          prev.map((c) => (c.id === editingCameraId ? { ...c, ...updated } : c))
        );
        showFeedback(`Camera unit "${formData.name}" updated successfully.`);
      } else {
        const payload: BackendCameraCreatePayload = {
          name: formData.name,
          stream_url: formData.stream_url,
          source_type: formData.source_type,
          sector: formData.sector,
          location: formData.location,
          latitude: typeof formData.latitude === "number" ? formData.latitude : 0,
          longitude: typeof formData.longitude === "number" ? formData.longitude : 0,
          fps: Number(formData.fps) || 25,
        };
        const created = await api.createCamera(payload);
        setCameraList((prev) => [created, ...prev]);
        showFeedback(`New perimeter camera "${formData.name}" registered successfully.`);
      }
      setIsFormModalOpen(false);
    } catch (err) {
      showFeedback("Failed to save camera parameters. Check backend logs.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCamera) return;
    setIsDeleting(true);
    try {
      await api.deleteCamera(deletingCamera.id);
      setCameraList((prev) => prev.filter((c) => c.id !== deletingCamera.id));
      showFeedback(`Camera unit "${deletingCamera.name}" (${deletingCamera.code}) decommissioned.`);
      setDeletingCamera(null);
    } catch (err) {
      showFeedback("Failed to decommission camera.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (camId: string, targetStatus: CameraStatus) => {
    const backendStatus =
      targetStatus === "ACTIVE"
        ? "online"
        : targetStatus === "MAINTENANCE"
        ? "degraded"
        : targetStatus === "OFFLINE"
        ? "offline"
        : targetStatus.toLowerCase();

    // Optimistic update of local table
    setCameraList((prev) =>
      prev.map((c) => (c.id === camId ? { ...c, status: targetStatus } : c))
    );

    try {
      await api.updateCameraStatus(camId, backendStatus);
      showFeedback(`Status for unit ${camId} changed to ${targetStatus}.`);
    } catch (err) {
      showFeedback("Failed to update status on server.", "error");
    }
  };

  return (
    <Layout
      title="Perimeter Camera Fleet Management"
      subtitle="Hardware Telemetry, Optical Heartbeat & Network Stream Diagnostic Registry"
    >
      <div className="space-y-4">
        {/* Feedback Alert Toast */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between shadow-sm transition-all animate-fadeIn ${
              feedback.type === "success"
                ? "bg-status-liveBg/60 border-status-live/30 text-navy-900"
                : "bg-status-criticalBg/60 border-status-critical/30 text-status-critical"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  feedback.type === "success" ? "bg-status-live animate-pulse" : "bg-status-critical"
                }`}
              />
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-navy-400 hover:text-navy-700 text-sm font-bold px-1 transition-colors"
              aria-label="Dismiss feedback"
            >
              ✕
            </button>
          </div>
        )}

        {/* Fleet Health Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active", value: counts.ACTIVE, color: "text-status-live", bg: "bg-status-liveBg border-status-live/20" },
            { label: "Alert", value: counts.ALERT, color: "text-status-critical", bg: "bg-status-criticalBg border-status-critical/20" },
            { label: "Offline", value: counts.OFFLINE, color: "text-navy-600", bg: "bg-navy-100 border-navy-200" },
            { label: "Maintenance", value: counts.MAINTENANCE, color: "text-status-warn", bg: "bg-status-warnBg border-status-warn/20" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-3 shadow-gov ${s.bg}`}>
              <p className="text-[10px] font-semibold text-navy-500 uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-bold font-mono mt-1 ${s.color}`}>
                {s.value.toString().padStart(2, "0")}
              </p>
            </div>
          ))}
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-3 shadow-gov flex flex-wrap items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-navy-400">
              <IconSearch size={14} />
            </div>
            <input
              type="text"
              id="camera-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Camera ID, Sector, IP..."
              aria-label="Search cameras"
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-semibold text-navy-600 flex items-center gap-1 mr-1 shrink-0">
                <IconFilter size={12} />
                Status:
              </span>
              {(["ALL", "ACTIVE", "ALERT", "OFFLINE", "MAINTENANCE"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                    statusFilter === status
                      ? "bg-navy-900 text-white"
                      : "bg-navy-100 text-navy-600 hover:bg-navy-200"
                  }`}
                >
                  {status} ({counts[status]})
                </button>
              ))}
            </div>

            {/* Add Camera Action */}
            <button
              onClick={handleOpenAdd}
              id="add-camera-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold shadow-sm transition-colors shrink-0"
              title="Register new camera"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Camera
            </button>
          </div>
        </div>

        {/* Camera Registry Table */}
        <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs" aria-label="Camera fleet registry">
              <thead>
                <tr className="border-b border-navy-200 bg-navy-50 text-navy-500 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Camera ID / Post</th>
                  <th className="py-3 px-4">Station Name &amp; Sector</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Resolution / FPS</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Last Heartbeat</th>
                  <th className="py-3 px-4 text-center">Active Det.</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filteredCameras.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        title="No cameras match the selected filters"
                        description="Try adjusting your search term or selecting a different status filter."
                        icon={
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredCameras.map((cam) => (
                    <tr
                      key={cam.id}
                      className={`transition-colors ${
                        cam.status === "ALERT"
                          ? "bg-status-criticalBg/10 hover:bg-status-criticalBg/20"
                          : "hover:bg-navy-50/80"
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-navy-900 bg-navy-100 border border-navy-200 px-2 py-0.5 rounded text-[11px]">
                            {cam.code}
                          </span>
                          <span className="text-[10px] text-navy-400 font-mono">{cam.postNumber}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-navy-900">{cam.name}</div>
                        <div className="text-[10px] text-navy-400 mt-0.5">{cam.sector}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {/* Interactive Status Modification preserving exact StatusBadge appearance */}
                        <div className="relative inline-flex items-center group" title="Click to modify camera status">
                          <StatusBadge status={cam.status} />
                          <select
                            value={cam.status}
                            onChange={(e) => handleStatusChange(cam.id, e.target.value as CameraStatus)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            aria-label={`Modify status for ${cam.name}`}
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="OFFLINE">OFFLINE</option>
                            <option value="MAINTENANCE">MAINTENANCE</option>
                            <option value="ALERT">ALERT</option>
                          </select>
                          <svg
                            className="w-2.5 h-2.5 ml-1 text-navy-400 group-hover:text-navy-700 transition-colors pointer-events-none"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-navy-600 whitespace-nowrap text-[11px]">
                        {cam.status !== "OFFLINE" ? cam.resolution : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-navy-600 whitespace-nowrap text-[11px]">
                        {cam.ipAddress}
                      </td>
                      <td className="py-3 px-4 text-navy-500 whitespace-nowrap text-[11px]">
                        <span className={cam.status === "OFFLINE" ? "text-status-critical font-semibold" : ""}>
                          {cam.lastHeartbeat}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-navy-900 whitespace-nowrap">
                        {cam.status === "OFFLINE" || cam.status === "MAINTENANCE" ? (
                          <span className="text-navy-400 font-normal">—</span>
                        ) : (
                          <span>
                            <span className={cam.personsActive > 0 ? "text-status-warn" : "text-navy-500"}>
                              {cam.personsActive}P
                            </span>
                            <span className="text-navy-300 mx-1">/</span>
                            <span className="text-navy-500">{cam.vehiclesActive}V</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate("/dashboard/feed")}
                            className="px-2 py-0.5 rounded bg-navy-100 hover:bg-navy-200 text-navy-700 text-[10px] font-medium border border-navy-200 transition-colors"
                          >
                            Live Feed
                          </button>
                          <button
                            onClick={() => navigate("/dashboard/analysis")}
                            className="px-2 py-0.5 rounded bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-medium transition-colors"
                          >
                            Analyse
                          </button>
                          {/* Edit Action */}
                          <button
                            onClick={() => handleOpenEdit(cam)}
                            className="px-2 py-0.5 rounded bg-navy-100 hover:bg-navy-200 text-navy-700 text-[10px] font-medium border border-navy-200 transition-colors"
                            title={`Edit ${cam.name}`}
                          >
                            Edit
                          </button>
                          {/* Delete Action */}
                          <button
                            onClick={() => setDeletingCamera(cam)}
                            className="px-2 py-0.5 rounded bg-status-criticalBg/40 hover:bg-status-criticalBg text-status-critical text-[10px] font-medium border border-status-critical/30 transition-colors"
                            title={`Delete ${cam.name}`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredCameras.length > 0 && (
            <div className="px-4 py-2 bg-navy-50 border-t border-navy-200 flex items-center justify-between text-[10px] text-navy-400 font-mono">
              <span>Showing {filteredCameras.length} of {cameraList.length} perimeter surveillance units</span>
              <span>ONVIF Profile S/T · RTP/RTSP · AES-256</span>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Camera Modal */}
      <Modal
        open={isFormModalOpen}
        onClose={() => !isSubmitting && setIsFormModalOpen(false)}
        title={isEditMode ? `Edit Camera — ${formData.name || "Perimeter Unit"}` : "Register New Perimeter Camera"}
        subtitle={
          isEditMode
            ? `ID: ${editingCameraId} · UPDATE HARDWARE TELEMETRY & NETWORK PARAMS`
            : "PROVISIONING PROTOCOL · ONVIF / RTSP / SENSOR INGESTION"
        }
        maxWidth="xl"
      >
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Name */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Camera Name / Station Label *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. BP-01 North Ridge Optical Unit"
                className="w-full px-3 py-2 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
              />
            </div>

            {/* Stream URL */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Stream URL / Ingestion URI *
              </label>
              <input
                type="text"
                required
                value={formData.stream_url}
                onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
                placeholder="rtsp://10.142.1.88:554/live/ch0 or webcam index (0)"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-navy-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
              />
            </div>

            {/* Source Type */}
            <div>
              <label className="block text-[11px] font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Source Type
              </label>
              <select
                value={formData.source_type}
                onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
              >
                <option value="rtsp">RTSP Network Stream</option>
                <option value="webcam">Local Sensor / Webcam (0)</option>
                <option value="file">Video File / Offline Test Source</option>
              </select>
            </div>

            {/* Sector */}
            <div>
              <label className="block text-[11px] font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Operational Sector *
              </label>
              <select
                value={formData.sector}
                onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
              >
                <option value="Sector Alpha">Sector Alpha (Northern Frontier)</option>
                <option value="Sector Bravo">Sector Bravo (Valley Defile)</option>
                <option value="Sector Charlie">Sector Charlie (Riverine Crossing)</option>
                <option value="Sector Delta">Sector Delta (Eastern Ridge)</option>
                <option value="Sector Echo">Sector Echo (Southern Scrublands)</option>
              </select>
            </div>

            {/* Location / Post */}
            <div>
              <label className="block text-[11px] font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Border Post / Location Code
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. BP-8421"
                className="w-full px-3 py-2 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
              />
            </div>

            {/* Target FPS */}
            <div>
              <label className="block text-[11px] font-semibold text-navy-700 uppercase tracking-wider mb-1">
                Target FPS
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={formData.fps}
                onChange={(e) => setFormData({ ...formData, fps: parseInt(e.target.value) || 25 })}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-navy-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
              />
            </div>

            {/* Latitude */}
            <div>
              <label className="block text-[11px] font-semibold text-navy-700 uppercase tracking-wider mb-1">
                GPS Latitude
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    latitude: e.target.value === "" ? "" : parseFloat(e.target.value),
                  })
                }
                placeholder="34.0837"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-navy-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
              />
            </div>

            {/* Longitude */}
            <div>
              <label className="block text-[11px] font-semibold text-navy-700 uppercase tracking-wider mb-1">
                GPS Longitude
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    longitude: e.target.value === "" ? "" : parseFloat(e.target.value),
                  })
                }
                placeholder="74.7973"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-navy-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-navy-200 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsFormModalOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-600 bg-navy-100 hover:bg-navy-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? "Processing..." : isEditMode ? "Save Changes" : "Register Unit"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deletingCamera}
        onClose={() => !isDeleting && setDeletingCamera(null)}
        title="Confirm Unit Decommission"
        subtitle="PERIMETER ASSET REMOVAL PROTOCOL"
        maxWidth="md"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-status-criticalBg/40 border border-status-critical/30">
            <div className="p-2 rounded bg-status-critical/10 text-status-critical shrink-0">
              <IconAlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-navy-900">
                Decommission {deletingCamera?.name} ({deletingCamera?.code})?
              </p>
              <p className="text-[11px] text-navy-600 mt-1 leading-relaxed">
                This action will immediately terminate optical telemetry and disconnect the real-time AI analytics stream from the sector monitoring matrix.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setDeletingCamera(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-600 bg-navy-100 hover:bg-navy-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-status-critical hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isDeleting ? "Decommissioning..." : "Confirm Decommission"}
            </button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
