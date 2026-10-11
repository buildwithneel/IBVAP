import { useState, useEffect, FormEvent } from "react";
import Layout from "../components/Layout";
import {
  IconCamera,
  IconCheck,
  IconEdit,
  IconHardDrive,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconServer,
  IconSettings,
  IconShield,
  IconTrash,
  IconWifi,
  IconX,
  IconVideo,
  IconPlay,
  IconSquare,
} from "../components/Icons";
import { IndiaGovEmblem, SSBEmblem, TricolorBar } from "../components/GovernmentEmblems";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import TestStreamingModal from "../components/TestStreamingModal";
import TestStreamingControlBar from "../components/TestStreamingControlBar";
import { api } from "../services/api";
import {
  Camera,
  BackendCameraCreatePayload,
  BackendCameraUpdatePayload,
  CameraTestConnectionResponse,
  DiscoveredCamera,
  GeneralSettings,
  RecordingStorageSettings,
  TestStreamStatus,
} from "../types";

type SettingsTab = "cameras" | "discovery" | "general" | "storage" | "security";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("cameras");
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoadingCameras, setIsLoadingCameras] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [protocolFilter, setProtocolFilter] = useState<string>("ALL");

  // Notification banners
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Add / Edit Modal state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);

  // Add / Edit Form State
  const [formMode, setFormMode] = useState<"rtsp" | "onvif" | "webcam">("rtsp");
  const [formData, setFormData] = useState<{
    name: string;
    ipAddress: string;
    port: number;
    username: string;
    password: string;
    streamUrl: string;
    substreamUrl: string;
    sector: string;
    location: string;
    fps: number;
    enabled: boolean;
  }>({
    name: "",
    ipAddress: "",
    port: 554,
    username: "",
    password: "",
    streamUrl: "",
    substreamUrl: "",
    sector: "Sector Alpha",
    location: "BP-01 (Main Perimeter)",
    fps: 25,
    enabled: true,
  });

  // Test Connection in Modal state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<CameraTestConnectionResponse | null>(null);

  // Single-row test connection state
  const [testingRowId, setTestingRowId] = useState<string | null>(null);
  const [rowTestResults, setRowTestResults] = useState<
    Record<string, CameraTestConnectionResponse>
  >({});

  // Delete Confirmation Modal
  const [cameraToDelete, setCameraToDelete] = useState<Camera | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ONVIF Discovery State
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredCamera[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState<string>("");
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);

  // General Settings State
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(() => {
    try {
      const saved = localStorage.getItem("ibvap_general_settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      appName: "IBVAP — Tactical Perimeter Surveillance Console",
      stationNodeId: "SECURE-NODE-IN04",
      defaultLayout: "2x2",
      telemetryRefreshSeconds: 2,
      lowLightHud: true,
      audioAlerts: false,
    };
  });

  // Storage Settings State
  const [storageSettings, setStorageSettings] = useState<RecordingStorageSettings>(() => {
    try {
      const saved = localStorage.getItem("ibvap_storage_settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      storagePath: "backend/storage/evidence",
      retentionDays: 60,
      hashVerificationAuto: true,
      snapshotQuality: "high",
      maxStorageAllocationGb: 500,
    };
  });

  // Simulated CCTV Video Test Streaming State
  const [showTestStreamModal, setShowTestStreamModal] = useState(false);
  const [testStreamingStatus, setTestStreamingStatus] = useState<TestStreamStatus>({
    is_streaming: false,
    status: "STOPPED",
    active_count: 0,
    active_streams: [],
    available_videos_count: 0,
  });
  const [isTogglingStream, setIsTogglingStream] = useState(false);

  // Load cameras & streaming status
  const loadCameras = async () => {
    setIsLoadingCameras(true);
    try {
      const [list, s] = await Promise.allSettled([
        api.getCameras(),
        api.getTestStreamingStatus(),
      ]);
      if (list.status === "fulfilled" && list.value) {
        setCameras(list.value);
      }
      if (s.status === "fulfilled" && s.value) {
        setTestStreamingStatus(s.value);
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: "Failed to load camera fleet from backend.",
      });
    } finally {
      setIsLoadingCameras(false);
    }
  };

  const handleQuickToggleTestStream = async () => {
    setIsTogglingStream(true);
    try {
      if (testStreamingStatus.is_streaming) {
        await api.stopTestStreaming({ all: true });
        setFeedback({
          type: "info",
          message: "Simulated video test streaming stopped.",
        });
      } else {
        const res = await api.startTestStreaming({ loop: true });
        setFeedback({
          type: "success",
          message: `Test streaming started for ${res.camera_name || "simulated camera"} using local video files.`,
        });
      }
      await loadCameras();
    } catch (err: any) {
      // If error or needs selection, open modal
      setShowTestStreamModal(true);
    } finally {
      setIsTogglingStream(false);
    }
  };

  useEffect(() => {
    loadCameras();
  }, []);

  // Auto-compose RTSP stream URL when IP/Port/Credentials change
  const handleIpChange = (ip: string) => {
    setFormData((prev) => {
      const auth =
        prev.username && prev.password ? `${prev.username}:${prev.password}@` : "";
      const stream =
        formMode === "onvif"
          ? prev.streamUrl || `rtsp://${auth}${ip}:${prev.port || 554}/onvif1`
          : `rtsp://${auth}${ip}:${prev.port || 554}/stream1`;
      return {
        ...prev,
        ipAddress: ip,
        streamUrl: prev.streamUrl ? prev.streamUrl : stream,
      };
    });
  };

  const handleOpenAddModal = () => {
    setEditingCamera(null);
    setFormMode("rtsp");
    setFormData({
      name: "",
      ipAddress: "",
      port: 554,
      username: "",
      password: "",
      streamUrl: "",
      substreamUrl: "",
      sector: "Sector Alpha",
      location: "BP-01",
      fps: 25,
      enabled: true,
    });
    setTestResult(null);
    setShowCameraModal(true);
  };

  const handleOpenEditModal = (cam: Camera) => {
    setEditingCamera(cam);
    const mode = (cam.sourceType as any) || (cam.streamUrl?.includes("webcam") ? "webcam" : "rtsp");
    setFormMode(mode === "onvif" ? "onvif" : mode === "webcam" ? "webcam" : "rtsp");
    setFormData({
      name: cam.name,
      ipAddress: cam.ipAddress || "",
      port: cam.port || 554,
      username: cam.username || "",
      password: "",
      streamUrl: cam.streamUrl || "",
      substreamUrl: cam.substreamUrl || "",
      sector: cam.sector || "Sector Alpha",
      location: cam.postNumber || "BP-01",
      fps: cam.fps || 25,
      enabled: cam.enabled !== false,
    });
    setTestResult(null);
    setShowCameraModal(true);
  };

  // Test connection inside the modal
  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api.testCameraConnection({
        source_type: formMode,
        stream_url: formData.streamUrl.trim(),
        ip_address: formData.ipAddress.trim(),
        port: Number(formData.port) || 554,
        username: formData.username.trim() || undefined,
        password: formData.password.trim() || undefined,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        reachable: false,
        message: err?.message || "Connection test failed: server unreachable.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Test single row connection from the table
  const handleTestRowConnection = async (cam: Camera) => {
    setTestingRowId(cam.id);
    try {
      const res = await api.testCameraConnection({
        source_type: cam.sourceType || "rtsp",
        stream_url: cam.streamUrl,
        ip_address: cam.ipAddress,
        port: cam.port || 554,
        username: cam.username,
      });
      setRowTestResults((prev) => ({ ...prev, [cam.id]: res }));
      setFeedback({
        type: res.success ? "success" : "error",
        message: `${cam.name}: ${res.message}`,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: `Failed to test connection for ${cam.name}`,
      });
    } finally {
      setTestingRowId(null);
    }
  };

  // Enable or Disable Camera
  const handleToggleEnable = async (cam: Camera) => {
    const nextEnabled = !cam.enabled;
    try {
      if (nextEnabled) {
        await api.startCamera({
          camera_id: cam.id,
          name: cam.name,
          stream_url: cam.streamUrl,
          source_type: cam.sourceType || "rtsp",
          sector: cam.sector,
          location: cam.postNumber,
        });
      } else {
        await api.stopCamera(cam.id);
      }
      await api.updateCamera(cam.id, { enabled: nextEnabled });
      await loadCameras();
      setFeedback({
        type: "info",
        message: `${cam.name} ${nextEnabled ? "enabled & worker initiated" : "disabled & stream stopped"}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: `Failed to toggle status: ${err?.message || "Server error"}`,
      });
    }
  };

  // Save Add / Edit Camera
  const handleSaveCamera = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFeedback({ type: "error", message: "Camera name is required." });
      return;
    }

    let finalStreamUrl = formData.streamUrl.trim();
    if (!finalStreamUrl && formData.ipAddress) {
      const auth =
        formData.username && formData.password
          ? `${formData.username}:${formData.password}@`
          : "";
      finalStreamUrl = `rtsp://${auth}${formData.ipAddress}:${formData.port || 554}/stream1`;
    }

    if (!finalStreamUrl) {
      setFeedback({
        type: "error",
        message: "Stream URL or Camera IP is required to establish stream.",
      });
      return;
    }

    try {
      if (editingCamera) {
        const payload: BackendCameraUpdatePayload = {
          name: formData.name.trim(),
          stream_url: finalStreamUrl,
          source_type: formMode,
          ip_address: formData.ipAddress.trim() || undefined,
          port: Number(formData.port) || 554,
          username: formData.username.trim() || undefined,
          password: formData.password.trim() || undefined,
          substream_url: formData.substreamUrl.trim() || undefined,
          sector: formData.sector.trim(),
          location: formData.location.trim(),
          fps: Number(formData.fps) || 25,
          enabled: formData.enabled,
        };
        await api.updateCamera(editingCamera.id, payload);
        setFeedback({
          type: "success",
          message: `Camera "${formData.name}" updated successfully.`,
        });
      } else {
        const payload: BackendCameraCreatePayload = {
          name: formData.name.trim(),
          stream_url: finalStreamUrl,
          source_type: formMode,
          ip_address: formData.ipAddress.trim() || undefined,
          port: Number(formData.port) || 554,
          username: formData.username.trim() || undefined,
          password: formData.password.trim() || undefined,
          substream_url: formData.substreamUrl.trim() || undefined,
          sector: formData.sector.trim(),
          location: formData.location.trim(),
          fps: Number(formData.fps) || 25,
          enabled: formData.enabled,
        };
        await api.createCamera(payload);
        setFeedback({
          type: "success",
          message: `Camera "${formData.name}" registered and saved to fleet.`,
        });
      }

      setShowCameraModal(false);
      await loadCameras();
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err?.message || "Failed to save camera. Please verify backend state.",
      });
    }
  };

  // Delete Camera
  const confirmDeleteCamera = async () => {
    if (!cameraToDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteCamera(cameraToDelete.id);
      setFeedback({
        type: "success",
        message: `Camera "${cameraToDelete.name}" deleted from fleet.`,
      });
      setCameraToDelete(null);
      await loadCameras();
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: "Failed to delete camera: " + (err?.message || "Unknown error"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // ONVIF Discovery Trigger
  const handleScanOnvif = async () => {
    setIsScanning(true);
    setDiscoveryMessage("");
    try {
      const res = await api.discoverOnvifCameras();
      setDiscoveredDevices(res.discovered || []);
      setDiscoveryMessage(res.message);
      setLastScanTime(new Date().toLocaleTimeString("en-IN"));
      if (res.discovered && res.discovered.length > 0) {
        setFeedback({
          type: "success",
          message: `Discovered ${res.discovered.length} ONVIF device(s) on broadcast domain.`,
        });
      } else {
        setFeedback({
          type: "info",
          message: res.message || "Scan completed. 0 ONVIF broadcast nodes detected.",
        });
      }
    } catch (err: any) {
      setDiscoveryMessage("ONVIF Discovery probe failed: " + (err?.message || "Network socket error"));
      setFeedback({
        type: "error",
        message: "Discovery probe failed. Verify UDP multicast privileges.",
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Import Discovered Device to Add Form
  const handleImportDiscovered = (d: DiscoveredCamera) => {
    setEditingCamera(null);
    setFormMode("onvif");
    setFormData({
      name: `${d.manufacturer || "ONVIF"} ${d.ip}`,
      ipAddress: d.ip,
      port: d.port || 80,
      username: "",
      password: "",
      streamUrl: d.suggested_stream_url || `rtsp://${d.ip}:554/stream1`,
      substreamUrl: `rtsp://${d.ip}:554/stream2`,
      sector: "Sector Alpha",
      location: `Subnet Discovery (${d.ip})`,
      fps: 25,
      enabled: true,
    });
    setTestResult(null);
    setShowCameraModal(true);
  };

  // Save General Settings
  const handleSaveGeneralSettings = (e: FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("ibvap_general_settings", JSON.stringify(generalSettings));
      setFeedback({
        type: "success",
        message: "General system configuration saved to terminal storage.",
      });
    } catch {
      setFeedback({ type: "error", message: "Failed to persist general settings." });
    }
  };

  // Save Storage Settings
  const handleSaveStorageSettings = (e: FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem("ibvap_storage_settings", JSON.stringify(storageSettings));
      setFeedback({
        type: "success",
        message: "Evidence recording & cryptographic storage rules updated.",
      });
    } catch {
      setFeedback({ type: "error", message: "Failed to persist storage settings." });
    }
  };

  // Filter cameras
  const filteredCameras = cameras.filter((cam) => {
    const matchesSearch =
      cam.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cam.sector.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cam.postNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cam.ipAddress && cam.ipAddress.includes(searchTerm));
    const matchesStatus =
      statusFilter === "ALL" ? true : cam.status === statusFilter;
    const matchesProto =
      protocolFilter === "ALL"
        ? true
        : (cam.sourceType || "rtsp").toUpperCase() === protocolFilter;
    return matchesSearch && matchesStatus && matchesProto;
  });

  return (
    <Layout
      title="Settings"
      subtitle="CCTV Fleet Management & Station Configuration"
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Top Header Banner */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-navy-950 text-white shadow-sm shrink-0">
              <IconSettings size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-navy-950 tracking-tight">
                  System &amp; CCTV Settings
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  SYSTEM READY
                </span>
              </div>
              <p className="text-xs text-navy-600 mt-0.5">
                Configure CCTV video streams, ONVIF discovery, storage rules, and tactical station parameters.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-2 bg-[#FAF9F5] border border-stone-200/90 rounded-full px-3 py-1 text-[11px] font-mono text-navy-700">
              <span className="w-2 h-2 rounded-full bg-status-live animate-cctv-pulse" />
              <span>TERMINAL:</span>
              <span className="font-semibold text-navy-900">{generalSettings.stationNodeId}</span>
            </div>
            <button
              onClick={loadCameras}
              disabled={isLoadingCameras}
              className="p-2 rounded-xl bg-[#FAF9F5] hover:bg-stone-100 border border-stone-200 text-navy-700 transition-colors cursor-pointer"
              title="Refresh Fleet"
              aria-label="Refresh Camera Fleet"
            >
              <IconRefresh size={16} className={isLoadingCameras ? "animate-spin" : ""} />
            </button>
            <button
              onClick={handleOpenAddModal}
              className="px-3.5 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 active:bg-navy-950 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <IconPlus size={15} />
              <span>Add Camera</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-alert-enter ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : feedback.type === "error"
                ? "bg-rose-50 border-rose-300 text-rose-900"
                : "bg-blue-50 border-blue-300 text-blue-900"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {feedback.type === "success" ? (
                <IconCheck size={16} className="text-emerald-700" />
              ) : (
                <IconShield size={16} className="text-navy-700" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="p-1 hover:bg-black/5 rounded cursor-pointer"
            >
              <IconX size={14} />
            </button>
          </div>
        )}

        {/* 5-Category Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-stone-200 overflow-x-auto pb-px">
          {[
            { id: "cameras", label: "Camera Management", icon: IconCamera, count: cameras.length },
            { id: "discovery", label: "ONVIF Discovery", icon: IconWifi, count: discoveredDevices.length || undefined },
            { id: "general", label: "General Settings", icon: IconSettings },
            { id: "storage", label: "Recording & Storage", icon: IconHardDrive },
            { id: "security", label: "Security & Access", icon: IconShield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-white text-navy-950 border-t-2 border-t-navy-900 border-x border-stone-200 shadow-sm"
                    : "text-navy-600 hover:text-navy-950 hover:bg-white/60"
                }`}
              >
                <Icon size={15} className={isActive ? "text-navy-900" : "text-navy-400"} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                      isActive ? "bg-navy-100 text-navy-800" : "bg-stone-200 text-stone-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: CAMERA MANAGEMENT */}
        {activeTab === "cameras" && (
          <div className="space-y-4 animate-page-enter">
            {/* Filter and Action Bar */}
            <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <IconSearch
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400"
                />
                <input
                  type="text"
                  placeholder="Search cameras by name, IP, sector..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-300/80 bg-[#FAF9F5] text-navy-950 placeholder:text-navy-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900/10 focus:border-navy-900"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-stone-300/80 bg-[#FAF9F5] text-navy-900 font-medium focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">ACTIVE / ONLINE</option>
                  <option value="OFFLINE">OFFLINE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="ALERT">ALERT</option>
                </select>

                <select
                  value={protocolFilter}
                  onChange={(e) => setProtocolFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-stone-300/80 bg-[#FAF9F5] text-navy-900 font-medium focus:bg-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Protocols</option>
                  <option value="RTSP">RTSP Streams</option>
                  <option value="ONVIF">ONVIF Devices</option>
                  <option value="WEBCAM">Local / USB</option>
                  <option value="FILE">Simulated / Video File</option>
                </select>

                <button
                  onClick={() => setActiveTab("discovery")}
                  className="px-3 py-2 rounded-xl bg-[#FAF9F5] hover:bg-stone-100 border border-stone-300/80 text-navy-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <IconWifi size={14} />
                  <span>Discover ONVIF</span>
                </button>

                {/* Clearly Visible Video Streaming Control in Camera Management */}
                <div className="flex items-center gap-1.5 border-l border-stone-200 pl-2 ml-1">
                  <span
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-mono font-bold border transition-colors ${
                      testStreamingStatus.is_streaming
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-[#FAF9F5] border-stone-300/80 text-stone-600"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        testStreamingStatus.is_streaming ? "bg-emerald-600 animate-pulse" : "bg-stone-400"
                      }`}
                    />
                    <span>{testStreamingStatus.is_streaming ? `Streaming (${testStreamingStatus.active_count})` : "Stopped"}</span>
                  </span>

                  {testStreamingStatus.is_streaming ? (
                    <button
                      type="button"
                      onClick={handleQuickToggleTestStream}
                      disabled={isTogglingStream}
                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                      title="Stop Simulated CCTV Stream"
                    >
                      <IconSquare size={13} />
                      <span>Stop Streaming</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTestStreamModal(true)}
                      disabled={isTogglingStream}
                      className="px-3.5 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 active:bg-navy-950 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                      title="Start simulated video stream using local files"
                    >
                      <IconPlay size={13} />
                      <span>Start Test Streaming</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowTestStreamModal(true)}
                    className="px-2.5 py-2 rounded-xl bg-[#FAF9F5] hover:bg-stone-100 border border-stone-300/80 text-navy-800 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="Select Local Video File & Assign Camera..."
                  >
                    <IconVideo size={14} />
                    <span className="hidden sm:inline">Select Video...</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Cameras Table */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F5] border-b border-stone-200 text-navy-700 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Camera Identity</th>
                      <th className="py-3 px-4">Protocol &amp; IP</th>
                      <th className="py-3 px-4">Stream Endpoint</th>
                      <th className="py-3 px-4">Sector / Post</th>
                      <th className="py-3 px-4">State</th>
                      <th className="py-3 px-4 text-center">Enable</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/80 text-navy-900">
                    {filteredCameras.map((cam) => {
                      const rowResult = rowTestResults[cam.id];
                      const isRowTesting = testingRowId === cam.id;

                      return (
                        <tr key={cam.id} className="hover:bg-[#FAF9F5]/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-navy-950">{cam.name}</span>
                              {cam.isSimulated && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  TEST STREAM
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-navy-500">{cam.code}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                                  cam.isSimulated
                                    ? "bg-amber-800 text-white"
                                    : "bg-navy-900 text-white"
                                }`}
                              >
                                {cam.isSimulated ? "SIMULATED (FILE)" : (cam.sourceType || "RTSP")}
                              </span>
                              <span className="font-mono text-[11px] text-navy-700">
                                {cam.ipAddress}:{cam.port || 554}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="max-w-[220px] truncate font-mono text-[11px] text-navy-600" title={cam.streamUrl}>
                              {cam.streamUrl || "—"}
                            </div>
                            {cam.substreamUrl && (
                              <div className="max-w-[220px] truncate font-mono text-[9px] text-navy-400" title={cam.substreamUrl}>
                                Sub: {cam.substreamUrl}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-navy-900">{cam.sector}</div>
                            <div className="text-[10px] text-navy-500">{cam.postNumber}</div>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={cam.status} />
                            {rowResult && (
                              <div className="mt-1">
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium ${
                                    rowResult.success
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-rose-100 text-rose-800"
                                  }`}
                                >
                                  {rowResult.success ? `PASS (${rowResult.latency_ms}ms)` : "FAIL"}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleEnable(cam)}
                              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer focus:outline-none ${
                                cam.enabled !== false ? "bg-navy-900" : "bg-stone-300"
                              }`}
                              title={cam.enabled !== false ? "Disable camera" : "Enable camera"}
                            >
                              <span
                                className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                  cam.enabled !== false ? "translate-x-4.5" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {cam.isSimulated ? (
                                <button
                                  onClick={async () => {
                                    if (cam.status === "ACTIVE") {
                                      await api.stopCamera(cam.id);
                                    } else {
                                      await api.startTestStreaming({ camera_id: cam.id });
                                    }
                                    await loadCameras();
                                  }}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                                    cam.status === "ACTIVE"
                                      ? "bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800"
                                      : "bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800"
                                  }`}
                                  title={cam.status === "ACTIVE" ? "Stop simulated test stream" : "Start simulated test stream"}
                                >
                                  {cam.status === "ACTIVE" ? <IconSquare size={11} /> : <IconPlay size={11} />}
                                  <span>{cam.status === "ACTIVE" ? "Stop" : "Stream"}</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleTestRowConnection(cam)}
                                  disabled={isRowTesting}
                                  className="px-2 py-1 rounded-lg bg-[#FAF9F5] hover:bg-stone-200 border border-stone-300 text-navy-800 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                                  title="Verify stream socket & handshake"
                                >
                                  {isRowTesting ? (
                                    <IconRefresh size={12} className="animate-spin text-navy-900" />
                                  ) : (
                                    <IconWifi size={12} />
                                  )}
                                  <span>Test</span>
                                </button>
                              )}

                              <button
                                onClick={() => handleOpenEditModal(cam)}
                                className="p-1.5 rounded-lg text-navy-600 hover:text-navy-900 hover:bg-stone-100 transition-colors cursor-pointer"
                                title="Edit Camera"
                              >
                                <IconEdit size={14} />
                              </button>

                              <button
                                onClick={() => setCameraToDelete(cam)}
                                className="p-1.5 rounded-lg text-navy-400 hover:text-status-critical hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete Camera"
                              >
                                <IconTrash size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredCameras.length === 0 && !isLoadingCameras && (
                <div className="p-8">
                  <EmptyState
                    title="No Cameras Found"
                    description={
                      searchTerm
                        ? `No camera matching "${searchTerm}". Try resetting search filter.`
                        : "No cameras configured in system. Click 'Add Camera' or 'Discover ONVIF' to register devices."
                    }
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CAMERA DISCOVERY */}
        {activeTab === "discovery" && (
          <div className="space-y-6 animate-page-enter">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-navy-950">
                    ONVIF WS-Discovery Network Probe
                  </h2>
                  <p className="text-xs text-navy-600 mt-0.5">
                    Broadcasts UDP multicast probes (239.255.255.250:3702) across the local subnet to detect Network Video Transmitters (NVT Profile S).
                  </p>
                </div>

                <button
                  onClick={handleScanOnvif}
                  disabled={isScanning}
                  className="px-4 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <IconWifi size={16} className={isScanning ? "animate-pulse" : ""} />
                  <span>{isScanning ? "Scanning Broadcast Domain..." : "Scan Subnet for ONVIF"}</span>
                </button>
              </div>

              {discoveryMessage && (
                <div className="p-3 rounded-xl bg-[#FAF9F5] border border-stone-200 text-xs text-navy-800 flex items-center justify-between">
                  <span>{discoveryMessage}</span>
                  {lastScanTime && <span className="text-[10px] text-navy-500 font-mono">Last scanned: {lastScanTime}</span>}
                </div>
              )}
            </div>

            {/* Discovered Cards */}
            {discoveredDevices.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {discoveredDevices.map((d, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-navy-900 text-white">
                          ONVIF NVT
                        </span>
                        <h3 className="text-sm font-bold text-navy-950 mt-1">{d.ip}:{d.port}</h3>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-status-live animate-cctv-pulse mt-1" />
                    </div>

                    <div className="text-xs space-y-1 text-navy-700 font-mono bg-[#FAF9F5] p-2.5 rounded-xl border border-stone-200/80">
                      <div><span className="text-navy-400">XAddrs:</span> {d.xaddrs}</div>
                      <div><span className="text-navy-400">Profile:</span> {d.model}</div>
                      <div><span className="text-navy-400">Suggested:</span> {d.suggested_stream_url}</div>
                    </div>

                    <button
                      onClick={() => handleImportDiscovered(d)}
                      className="w-full py-2 px-3 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <IconPlus size={14} />
                      <span>Import into Fleet</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm text-center">
                <EmptyState
                  title="No Devices Detected Yet"
                  description="Click 'Scan Subnet for ONVIF' to search local network cameras, or manually register an RTSP stream in the Camera Management tab."
                />
              </div>
            )}

            {/* Technical Help Card */}
            <div className="bg-[#FAF9F5] rounded-2xl border border-stone-200 p-4 text-xs space-y-2 text-navy-700">
              <p className="font-semibold text-navy-900">ONVIF Technical Integration Note:</p>
              <p className="leading-relaxed">
                Standard ONVIF WS-Discovery relies on UDP multicast frames on port 3702. If your surveillance cameras reside across routed VLANs or managed network switches with IGMP Snooping enabled, ensure multicast relay is configured, or add the RTSP stream URL directly using the <strong>Add Camera</strong> form.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: GENERAL SETTINGS */}
        {activeTab === "general" && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 max-w-3xl animate-page-enter">
            <h2 className="text-sm font-bold text-navy-950 mb-1">General Terminal Configuration</h2>
            <p className="text-xs text-navy-600 mb-6">
              Configure system display preferences, terminal node identification, and telemetry parameters.
            </p>

            <form onSubmit={handleSaveGeneralSettings} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-navy-900">
                  Application Title &amp; Command Room Branding
                </label>
                <input
                  type="text"
                  value={generalSettings.appName}
                  onChange={(e) =>
                    setGeneralSettings((prev) => ({ ...prev, appName: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-navy-900">
                    Terminal Gateway Node ID
                  </label>
                  <input
                    type="text"
                    value={generalSettings.stationNodeId}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({ ...prev, stationNodeId: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-navy-900">
                    Default Video Grid Layout
                  </label>
                  <select
                    value={generalSettings.defaultLayout}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({
                        ...prev,
                        defaultLayout: e.target.value as any,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                  >
                    <option value="2x2">2x2 Tactical Quad Grid</option>
                    <option value="3x3">3x3 High-Density Grid</option>
                    <option value="focus">Focus Master + Side Rail</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-navy-900">
                  Telemetry Polling Interval
                </label>
                <select
                  value={generalSettings.telemetryRefreshSeconds}
                  onChange={(e) =>
                    setGeneralSettings((prev) => ({
                      ...prev,
                      telemetryRefreshSeconds: Number(e.target.value),
                    }))
                  }
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                >
                  <option value={1}>1 Second (Ultra Low Latency)</option>
                  <option value={2}>2 Seconds (Balanced Standard)</option>
                  <option value={5}>5 Seconds (Bandwidth Conserving)</option>
                </select>
              </div>

              <div className="pt-2 space-y-3 border-t border-stone-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generalSettings.lowLightHud}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({ ...prev, lowLightHud: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-stone-300 text-navy-900 focus:ring-2 focus:ring-navy-900 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold text-navy-900 block">
                      High-Contrast Night Operations HUD
                    </span>
                    <span className="text-[11px] text-navy-600">
                      Renders tactical HUD crosshairs and tripwire overlays with enhanced luminescent contrast.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={generalSettings.audioAlerts}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({ ...prev, audioAlerts: e.target.checked }))
                    }
                    className="w-4 h-4 rounded border-stone-300 text-navy-900 focus:ring-2 focus:ring-navy-900 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold text-navy-900 block">
                      Acoustic Tripwire Breach Chime
                    </span>
                    <span className="text-[11px] text-navy-600">
                      Play acoustic alert tone when AI intrusion or boundary breach triggers.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save General Settings
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 4: RECORDING & STORAGE */}
        {activeTab === "storage" && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 max-w-3xl animate-page-enter">
            <h2 className="text-sm font-bold text-navy-950 mb-1">
              Evidence Recording &amp; Cryptographic Storage
            </h2>
            <p className="text-xs text-navy-600 mb-6">
              Configure local forensic storage path, retention policies, and automated SHA-256 hash chains.
            </p>

            <form onSubmit={handleSaveStorageSettings} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-navy-900">
                  Active Storage Directory
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={storageSettings.storagePath}
                    onChange={(e) =>
                      setStorageSettings((prev) => ({ ...prev, storagePath: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-mono focus:bg-white focus:outline-none"
                  />
                  <span className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 font-mono font-semibold shrink-0">
                    MOUNTED
                  </span>
                </div>
                <p className="text-[10px] text-navy-500">
                  All incident snapshots, bounding box clips, and forensic audit JSON logs are written here.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-navy-900">
                    Retention Window (Days)
                  </label>
                  <select
                    value={storageSettings.retentionDays}
                    onChange={(e) =>
                      setStorageSettings((prev) => ({
                        ...prev,
                        retentionDays: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                  >
                    <option value={30}>30 Days (Standard Rotation)</option>
                    <option value={60}>60 Days (Tactical Command Policy)</option>
                    <option value={90}>90 Days (Official Secrets Act Strict)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-navy-900">
                    Snapshot Capture Quality
                  </label>
                  <select
                    value={storageSettings.snapshotQuality}
                    onChange={(e) =>
                      setStorageSettings((prev) => ({
                        ...prev,
                        snapshotQuality: e.target.value as any,
                      }))
                    }
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                  >
                    <option value="high">High Definition (JPEG 95% with Watermark)</option>
                    <option value="standard">Standard Definition (JPEG 80%)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-stone-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={storageSettings.hashVerificationAuto}
                    onChange={(e) =>
                      setStorageSettings((prev) => ({
                        ...prev,
                        hashVerificationAuto: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded border-stone-300 text-navy-900 focus:ring-2 focus:ring-navy-900 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-semibold text-navy-900 block">
                      Enforce Automatic Cryptographic SHA-256 Hash Chain
                    </span>
                    <span className="text-[11px] text-navy-600">
                      Computes SHA-256 digest on every captured snapshot immediately to guarantee judicial chain of custody.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Storage Policies
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 5: SECURITY & ACCOUNT */}
        {activeTab === "security" && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 max-w-3xl space-y-6 animate-page-enter">
            <div>
              <h2 className="text-sm font-bold text-navy-950 mb-1">
                Operator Security &amp; Access Clearance
              </h2>
              <p className="text-xs text-navy-600">
                Active session authentication status and Ministry of Home Affairs security credentials.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-stone-200 space-y-1">
                <span className="text-[10px] font-semibold text-navy-500 uppercase tracking-wide">
                  Active Operator
                </span>
                <p className="text-xs font-bold text-navy-950">Operator Console User</p>
                <p className="text-[11px] font-mono text-navy-600">SSB-SEC-8421@ibvap.gov.in</p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-stone-200 space-y-1">
                <span className="text-[10px] font-semibold text-navy-500 uppercase tracking-wide">
                  Security Clearance
                </span>
                <p className="text-xs font-bold text-emerald-800">LEVEL-3 (TACTICAL OPS)</p>
                <p className="text-[11px] text-navy-600">48th Battalion · Sashastra Seema Bal</p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-stone-200 space-y-1">
                <span className="text-[10px] font-semibold text-navy-500 uppercase tracking-wide">
                  Encryption Protocol
                </span>
                <p className="text-xs font-bold text-navy-950">TLS 1.3 / AES-256-GCM</p>
                <p className="text-[11px] text-navy-600">NIC / CERT-In Certified Channel</p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-stone-200 space-y-1">
                <span className="text-[10px] font-semibold text-navy-500 uppercase tracking-wide">
                  Session Token Validity
                </span>
                <p className="text-xs font-bold text-navy-950">Active JWT Bearer</p>
                <p className="text-[11px] font-mono text-navy-600">Header: Authorization Bearer</p>
              </div>
            </div>

            {/* Compliance Notice */}
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <IconShield size={15} className="text-amber-800" />
                <span>Statutory Compliance Notice</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Terminal operations are governed under the Official Secrets Act, 1923. In accordance with MHA cybersecurity standards, operator passwords cannot be modified through the browser interface. All credential updates require authorized system administrator validation.
              </p>
            </div>
          </div>
        )}

        {/* MODAL: ADD / EDIT CAMERA */}
        {showCameraModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full p-6 text-navy-950 animate-card-enter max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-stone-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-navy-950 text-white">
                    <IconCamera size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-navy-950">
                      {editingCamera ? "Edit Camera Configuration" : "Register New CCTV Camera"}
                    </h2>
                    <p className="text-[11px] text-navy-600">
                      {editingCamera ? `Modify endpoint & parameters for ${editingCamera.name}` : "Configure RTSP, ONVIF, or local video source."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCameraModal(false)}
                  className="p-1.5 rounded-lg text-navy-400 hover:text-navy-700 hover:bg-stone-100 transition-colors cursor-pointer"
                >
                  <IconX size={16} />
                </button>
              </div>

              {/* Protocol Selector Tabs */}
              <div className="grid grid-cols-3 gap-2 my-4 bg-[#FAF9F5] p-1.5 rounded-2xl border border-stone-200">
                {[
                  { id: "rtsp", label: "RTSP Stream" },
                  { id: "onvif", label: "ONVIF IP Device" },
                  { id: "webcam", label: "Local / USB" },
                ].map((proto) => (
                  <button
                    key={proto.id}
                    type="button"
                    onClick={() => {
                      setFormMode(proto.id as any);
                      if (proto.id === "rtsp" && formData.port === 80) setFormData((p) => ({ ...p, port: 554 }));
                      if (proto.id === "onvif" && formData.port === 554) setFormData((p) => ({ ...p, port: 80 }));
                    }}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      formMode === proto.id
                        ? "bg-white text-navy-950 shadow-sm border border-stone-200"
                        : "text-navy-600 hover:text-navy-900"
                    }`}
                  >
                    {proto.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSaveCamera} className="space-y-4">
                {/* Basic Info */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-navy-900 uppercase tracking-wider">
                    A. Device Identity
                  </h3>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-navy-900">Camera Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ravine Ridge Master PTZ"
                      value={formData.name}
                      onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="block text-xs font-semibold text-navy-900">IP Address or Host</label>
                      <input
                        type="text"
                        placeholder="192.168.1.120 or hostname"
                        value={formData.ipAddress}
                        onChange={(e) => handleIpChange(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-mono focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-navy-900">Port</label>
                      <input
                        type="number"
                        placeholder={formMode === "rtsp" ? "554" : "80"}
                        value={formData.port}
                        onChange={(e) => setFormData((p) => ({ ...p, port: Number(e.target.value) }))}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-mono focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {formMode !== "webcam" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-navy-900">Username (Optional)</label>
                        <input
                          type="text"
                          placeholder="admin"
                          value={formData.username}
                          onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))}
                          className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                          autoComplete="off"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-navy-900">Password (Optional)</label>
                        <input
                          type="password"
                          placeholder="••••••••••••"
                          value={formData.password}
                          onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                          className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Stream Configuration */}
                <div className="space-y-3 pt-3 border-t border-stone-200">
                  <h3 className="text-xs font-bold text-navy-900 uppercase tracking-wider">
                    B. Stream Endpoint &amp; Sector
                  </h3>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-navy-900">
                      RTSP Stream URL or Path *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="rtsp://admin:pass@192.168.1.120:554/stream1"
                      value={formData.streamUrl}
                      onChange={(e) => setFormData((p) => ({ ...p, streamUrl: e.target.value }))}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-mono focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-navy-900">
                      Substream URL (Optional for low-bandwidth grid)
                    </label>
                    <input
                      type="text"
                      placeholder="rtsp://admin:pass@192.168.1.120:554/stream2"
                      value={formData.substreamUrl}
                      onChange={(e) => setFormData((p) => ({ ...p, substreamUrl: e.target.value }))}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-mono focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-navy-900">Sector</label>
                      <input
                        type="text"
                        placeholder="Sector Alpha"
                        value={formData.sector}
                        onChange={(e) => setFormData((p) => ({ ...p, sector: e.target.value }))}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-navy-900">Border Post</label>
                      <input
                        type="text"
                        placeholder="BP-04"
                        value={formData.location}
                        onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-navy-900">Target FPS</label>
                      <select
                        value={formData.fps}
                        onChange={(e) => setFormData((p) => ({ ...p, fps: Number(e.target.value) }))}
                        className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 bg-[#FAF9F5] text-navy-950 font-medium focus:bg-white focus:outline-none"
                      >
                        <option value={15}>15 FPS (Conserving)</option>
                        <option value={25}>25 FPS (PAL Standard)</option>
                        <option value={30}>30 FPS (NTSC Standard)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Test Result Pill */}
                {testResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                      testResult.success
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                        : "bg-rose-50 border-rose-300 text-rose-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{testResult.success ? "VERIFIED:" : "ERROR:"}</span>
                      <span>{testResult.message}</span>
                    </div>
                    {testResult.latency_ms && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/70">
                        {testResult.latency_ms}ms
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4 border-t border-stone-200">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-stone-300 bg-[#FAF9F5] hover:bg-stone-100 text-navy-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <IconWifi size={14} className={testingConnection ? "animate-spin" : ""} />
                    <span>{testingConnection ? "Testing Stream..." : "Test Connection"}</span>
                  </button>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setShowCameraModal(false)}
                      className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-navy-800 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {editingCamera ? "Save Changes" : "Save Camera"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: DELETE CONFIRMATION */}
        {cameraToDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-md w-full p-6 text-navy-950 animate-card-enter space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-100 text-rose-800">
                  <IconTrash size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-navy-950">Remove Camera from Fleet</h3>
                  <p className="text-xs text-navy-600">This action will stop active video workers.</p>
                </div>
              </div>

              <p className="text-xs text-navy-700 leading-relaxed bg-[#FAF9F5] p-3 rounded-xl border border-stone-200">
                Are you sure you want to remove <strong>{cameraToDelete.name}</strong> ({cameraToDelete.code})? It will be disconnected from the live CCTV monitoring grid.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCameraToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-navy-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCamera}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {isDeleting ? "Deleting..." : "Delete Camera"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: TEST VIDEO STREAMING (SIMULATED CAMERAS) */}
        <TestStreamingModal
          isOpen={showTestStreamModal}
          onClose={() => setShowTestStreamModal(false)}
          onStreamStarted={async () => {
            await loadCameras();
            setShowTestStreamModal(false);
          }}
          onStreamStopped={async () => {
            await loadCameras();
            setShowTestStreamModal(false);
          }}
          cameras={cameras}
        />
      </div>
    </Layout>
  );
}
