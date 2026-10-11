import React, { useState, useEffect, useRef } from "react";
import {
  IconCamera,
  IconCheck,
  IconFilm,
  IconPlay,
  IconRefresh,
  IconRepeat,
  IconSquare,
  IconTrash,
  IconVideo,
  IconX,
} from "./Icons";
import { api } from "../services/api";
import { Camera, TestStreamVideo, TestStreamStatus } from "../types";
import { useSurveillanceStream } from "../context/SurveillanceStreamContext";

interface TestStreamingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStreamStarted?: (session: any) => void;
  onStreamStopped?: () => void;
  cameras?: Camera[];
  selectedCameraId?: string;
}

export default function TestStreamingModal({
  isOpen,
  onClose,
  onStreamStarted,
  onStreamStopped,
  cameras = [],
  selectedCameraId,
}: TestStreamingModalProps) {
  let streamCtx: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    streamCtx = useSurveillanceStream();
  } catch {}

  const [videos, setVideos] = useState<TestStreamVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [loopContinuous, setLoopContinuous] = useState(true);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Streaming status
  const [streamStatus, setStreamStatus] = useState<TestStreamStatus>({
    is_streaming: false,
    status: "STOPPED",
    active_count: 0,
    active_streams: [],
    available_videos_count: 0,
  });
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  // Load videos and status on open
  useEffect(() => {
    if (!isOpen) return;
    loadVideosAndStatus();
  }, [isOpen, selectedCameraId]);

  const loadVideosAndStatus = async () => {
    setIsLoadingVideos(true);
    setErrorMsg(null);
    try {
      const [vidsRes, statusRes] = await Promise.allSettled([
        api.getTestStreamVideos(),
        api.getTestStreamingStatus(),
      ]);

      if (vidsRes.status === "fulfilled" && vidsRes.value?.videos) {
        const vList = vidsRes.value.videos;
        setVideos(vList);
        if (vList.length > 0 && !selectedVideoId) {
          setSelectedVideoId(vList[0].id);
          setPreviewVideoUrl(buildVideoUrl(vList[0]));
        }
      }

      if (statusRes.status === "fulfilled" && statusRes.value) {
        setStreamStatus(statusRes.value);
      }
    } catch (err: any) {
      console.warn("Failed to load test stream videos:", err);
      setErrorMsg(err?.message || "Failed to scan for local video files.");
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const buildVideoUrl = (v: TestStreamVideo): string => {
    if (v.stream_url.startsWith("http://") || v.stream_url.startsWith("https://")) {
      return v.stream_url;
    }
    return `${api.getBaseUrl()}${v.stream_url.startsWith("/") ? "" : "/"}${v.stream_url}`;
  };

  const handleSelectVideo = (v: TestStreamVideo) => {
    setSelectedVideoId(v.id);
    setPreviewVideoUrl(buildVideoUrl(v));
  };

  // Upload handler for 1 or multiple video files
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setUploadProgress(`Uploading ${files.length} video file(s)...`);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }

      const res = await api.uploadTestVideos(formData);
      setSuccessMsg(res.message || `Successfully uploaded ${files.length} video(s). Simulated cameras registered.`);

      await loadVideosAndStatus();
      if (streamCtx) {
        await streamCtx.refreshCameras();
        streamCtx.incrementStreamRevision();
      }
    } catch (err: any) {
      console.error("Upload failed:", err);
      setErrorMsg(err?.message || "Failed to upload video files.");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Delete uploaded video
  const handleDeleteVideo = async (vid: TestStreamVideo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete '${vid.filename}'? Its associated camera stream will be safely stopped without affecting other cameras or evidence.`)) {
      return;
    }

    setIsActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.deleteTestVideo(vid.filename || vid.id);
      setSuccessMsg(res.message || `Deleted video '${vid.filename}'.`);

      await loadVideosAndStatus();
      if (streamCtx) {
        await streamCtx.refreshCameras();
        streamCtx.incrementStreamRevision();
      }
    } catch (err: any) {
      console.error("Delete video failed:", err);
      setErrorMsg(err?.message || `Failed to delete video '${vid.filename}'.`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Start ALL uploaded videos as separate independent simulated cameras
  const handleStartAllStreaming = async () => {
    if (videos.length === 0) {
      setErrorMsg("No uploaded video files available. Please upload surveillance videos first.");
      return;
    }

    setIsActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.startTestStreaming({ all: true, loop: loopContinuous });

      setSuccessMsg(
        res.message || `Activated ${res.active_count || videos.length} independent simulated cameras across the fleet!`
      );

      await loadVideosAndStatus();

      if (streamCtx) {
        await streamCtx.refreshCameras();
        streamCtx.incrementStreamRevision();
      }

      if (onStreamStarted) {
        onStreamStarted(res);
      }
    } catch (err: any) {
      console.error("Start all test streams failed:", err);
      setErrorMsg(err?.message || "Failed to start simulated test streaming.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Start single selected video stream
  const handleStartSingleVideo = async (vid: TestStreamVideo) => {
    setIsActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        video_id: vid.id,
        file_path: vid.file_path,
        loop: loopContinuous,
      };
      if (selectedCameraId) {
        payload.camera_id = selectedCameraId;
      }

      const res = await api.startTestStreaming(payload);

      setSuccessMsg(
        `Stream started for ${res.camera_name || vid.name}. Live video is now playing independently.`
      );

      await loadVideosAndStatus();

      if (streamCtx) {
        await streamCtx.refreshCameras();
        if (res?.camera_id) {
          streamCtx.setActiveCameraId(res.camera_id);
        }
        streamCtx.incrementStreamRevision();
      }

      if (onStreamStarted) {
        onStreamStarted(res);
      }
    } catch (err: any) {
      console.error("Start single test stream failed:", err);
      setErrorMsg(err?.message || "Failed to start local test streaming.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Stop ALL simulated test streams
  const handleStopAllStreaming = async () => {
    setIsActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.stopTestStreaming({ all: true });
      setSuccessMsg(res.message || "All simulated video test streams stopped.");
      setStreamStatus({
        is_streaming: false,
        status: "STOPPED",
        active_count: 0,
        active_streams: [],
        available_videos_count: videos.length,
      });

      await loadVideosAndStatus();

      if (streamCtx) {
        await streamCtx.refreshCameras();
        streamCtx.incrementStreamRevision();
      }

      if (onStreamStopped) {
        onStreamStopped();
      }
    } catch (err: any) {
      console.error("Stop test stream failed:", err);
      setErrorMsg(err?.message || "Failed to stop test streaming.");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Stop a single camera stream without affecting others
  const handleStopSingleStream = async (camId: string) => {
    try {
      await api.stopSingleTestStream(camId);
      await loadVideosAndStatus();
      if (streamCtx) {
        await streamCtx.refreshCameras();
        streamCtx.incrementStreamRevision();
      }
    } catch (e: any) {
      setErrorMsg(e?.message || `Failed to stop stream ${camId}`);
    }
  };

  const handlePauseStream = async (camId: string) => {
    try {
      await api.pauseTestStream(camId);
      await loadVideosAndStatus();
      if (streamCtx) streamCtx.incrementStreamRevision();
    } catch (e: any) {
      setErrorMsg(e?.message || `Failed to pause stream ${camId}`);
    }
  };

  const handleResumeStream = async (camId: string) => {
    try {
      await api.resumeTestStream(camId);
      await loadVideosAndStatus();
      if (streamCtx) streamCtx.incrementStreamRevision();
    } catch (e: any) {
      setErrorMsg(e?.message || `Failed to resume stream ${camId}`);
    }
  };

  const handleReplayStream = async (camId: string) => {
    try {
      await api.replayTestStream(camId);
      await loadVideosAndStatus();
      if (streamCtx) streamCtx.incrementStreamRevision();
    } catch (e: any) {
      setErrorMsg(e?.message || `Failed to replay stream ${camId}`);
    }
  };

  const handleToggleStreamLoop = async (camId: string, currentLoop: boolean) => {
    try {
      await api.setTestStreamLoop(camId, !currentLoop);
      await loadVideosAndStatus();
    } catch (e: any) {
      setErrorMsg(e?.message || `Failed to toggle loop for stream ${camId}`);
    }
  };

  if (!isOpen) return null;

  const selectedVideo = videos.find((v) => v.id === selectedVideoId) || videos[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs animate-modal-enter">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden text-navy-950">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 bg-[#FAF9F5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-navy-900 text-white flex items-center justify-center shadow-xs">
              <IconVideo size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-navy-950 uppercase tracking-wide">
                  CCTV Video Upload &amp; Simulated Fleet
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  {videos.length} Videos Uploaded
                </span>
                {streamStatus.is_streaming ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                    STREAMING ({streamStatus.active_count} ACTIVE)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-stone-100 text-stone-600 border border-stone-300">
                    FLEET STOPPED
                  </span>
                )}
              </div>
              <p className="text-xs text-navy-500 mt-0.5">
                Every uploaded video operates as a separate, independent simulated CCTV camera with its own AI detection and PTZ feed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadVideosAndStatus}
              disabled={isLoadingVideos}
              className="p-2 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-navy-700 transition-colors cursor-pointer"
              title="Rescan Project Videos"
              aria-label="Rescan Project Videos"
            >
              <IconRefresh size={15} className={isLoadingVideos ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-stone-200/60 text-navy-500 hover:text-navy-900 transition-colors cursor-pointer"
              aria-label="Close Modal"
            >
              <IconX size={18} />
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold">Error:</span>
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="p-1 hover:bg-rose-100 rounded text-rose-700 cursor-pointer"
            >
              <IconX size={14} />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconCheck size={16} className="text-emerald-700" />
              <span>{successMsg}</span>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="p-1 hover:bg-emerald-100 rounded text-emerald-700 cursor-pointer"
            >
              <IconX size={14} />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* SECTION 1: UPLOAD SECTION */}
          <div className="bg-[#FAF9F5] border border-stone-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-navy-900 uppercase tracking-wider flex items-center gap-2">
                  <IconVideo size={15} className="text-navy-700" />
                  <span>1. Upload Surveillance Videos</span>
                </h3>
                <p className="text-[11px] text-navy-500 mt-0.5">
                  Upload multiple surveillance video files (.mp4, .webm, .avi, .mkv). Each video is automatically assigned to an individual simulated camera (SIM-CAM-01, SIM-CAM-02, etc.).
                </p>
              </div>

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept="video/mp4,video/webm,video/avi,video/x-matroska,video/quicktime"
                  className="hidden"
                  id="cctv-video-file-input"
                />
                <label
                  htmlFor="cctv-video-file-input"
                  className={`px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-xs cursor-pointer ${
                    isUploading ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <IconFilm size={14} />
                  <span>{isUploading ? "Uploading..." : "Upload New Videos"}</span>
                </label>
              </div>
            </div>

            {isUploading && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 flex items-center gap-2 text-xs">
                <IconRefresh size={15} className="animate-spin text-blue-700" />
                <span>{uploadProgress || "Uploading video files..."}</span>
              </div>
            )}
          </div>

          {/* SECTION 2: CURRENTLY RUNNING INDEPENDENT CAMERA FEEDS */}
          {streamStatus.active_streams && streamStatus.active_streams.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-navy-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active Running Camera Feeds ({streamStatus.active_streams.length})
                </span>
                <span className="text-[10px] text-navy-500">
                  Each camera processes its video independently with isolated AI detections and telemetry
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1">
                {streamStatus.active_streams.map((st: any) => {
                  const camId = st.camera_id || st.id;
                  const camName = st.name || st.camera_name || `Camera ${camId}`;
                  return (
                    <div
                      key={camId}
                      className="bg-white border border-stone-200 rounded-lg p-2.5 flex items-center justify-between shadow-xs gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-navy-950 font-mono text-[11px] px-1.5 py-0.2 rounded bg-navy-100">
                            {camId}
                          </span>
                          <span className="font-semibold text-navy-900 truncate text-[11px]" title={camName}>
                            {camName}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                              st.paused ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {st.paused ? "PAUSED" : "ONLINE"}
                          </span>
                        </div>
                        <div className="text-[10px] text-navy-500 font-mono truncate mt-0.5">
                          {st.sector || "Sector Alpha"} · {st.fps ? `${st.fps} FPS` : "25 FPS"} · {st.resolution || "720p"}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {st.paused ? (
                          <button
                            type="button"
                            onClick={() => handleResumeStream(camId)}
                            className="p-1.5 rounded hover:bg-stone-100 text-emerald-600 cursor-pointer"
                            title="Resume Playback"
                          >
                            <IconPlay size={13} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePauseStream(camId)}
                            className="p-1.5 rounded hover:bg-stone-100 text-amber-600 cursor-pointer"
                            title="Pause Playback"
                          >
                            <IconSquare size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleReplayStream(camId)}
                          className="p-1.5 rounded hover:bg-stone-100 text-sky-600 cursor-pointer"
                          title="Replay from Beginning"
                        >
                          <IconRefresh size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleStreamLoop(camId, st.loop !== false)}
                          className={`p-1.5 rounded hover:bg-stone-100 cursor-pointer ${
                            st.loop !== false ? "text-indigo-600 font-bold" : "text-stone-400"
                          }`}
                          title={st.loop !== false ? "Looping Enabled" : "Looping Disabled"}
                        >
                          <IconRepeat size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStopSingleStream(camId)}
                          className="p-1.5 rounded hover:bg-rose-50 text-rose-600 cursor-pointer font-bold"
                          title="Stop this camera feed only"
                        >
                          <IconX size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION 3: UPLOADED VIDEO INVENTORY & CAMERA MAPPING */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-bold text-navy-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <IconFilm size={14} className="text-navy-600" />
                <span>2. Uploaded Videos &amp; Assigned Simulated Cameras ({videos.length} Available)</span>
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-navy-700 font-mono text-[11px]">
                  <input
                    type="checkbox"
                    checked={loopContinuous}
                    onChange={(e) => setLoopContinuous(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-navy-900 cursor-pointer"
                  />
                  <span>Loop Continuously</span>
                </label>
              </div>
            </div>

            {isLoadingVideos ? (
              <div className="p-8 border border-dashed border-stone-300 rounded-xl text-center space-y-2">
                <IconRefresh size={22} className="animate-spin mx-auto text-navy-400" />
                <p className="text-navy-600 font-medium">Scanning uploads directory for video files...</p>
              </div>
            ) : videos.length === 0 ? (
              <div className="p-8 border border-dashed border-stone-300 rounded-xl text-center space-y-2 bg-[#FAF9F5]">
                <IconFilm size={28} className="mx-auto text-navy-300" />
                <p className="font-bold text-navy-900">No uploaded video files discovered</p>
                <p className="text-navy-500 max-w-md mx-auto text-[11px]">
                  Upload surveillance video files (.mp4 or .webm) using the Upload button above.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto p-1 border border-stone-200 rounded-xl bg-stone-50/50">
                {videos.map((vid, index) => {
                  const isSelected = vid.id === selectedVideoId;
                  const assignedCamId = vid.camera_id || `SIM-CAM-${String(index + 1).padStart(2, "0")}`;
                  const isRunning = streamStatus.active_streams?.some((st: any) => (st.camera_id || st.id) === assignedCamId) || vid.is_streaming;

                  return (
                    <div
                      key={vid.id || vid.filename}
                      onClick={() => handleSelectVideo(vid)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2.5 ${
                        isSelected
                          ? "bg-white border-navy-900 shadow-sm ring-1 ring-navy-900/10"
                          : "bg-white/80 border-stone-200 hover:border-stone-300 hover:bg-white"
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-navy-900 text-white">
                            {assignedCamId}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                              isRunning
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-stone-100 text-stone-600 border border-stone-200"
                            }`}
                          >
                            {isRunning ? "ONLINE" : "STOPPED"}
                          </span>
                          <span className="font-semibold text-navy-950 truncate max-w-[180px]" title={vid.filename}>
                            {vid.filename}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-navy-600 font-mono">
                          <span>Size: {vid.size_formatted}</span>
                          <span>•</span>
                          <span>Res: {vid.resolution}</span>
                          <span>•</span>
                          <span>FPS: {vid.fps || 25}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        {isRunning ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStopSingleStream(assignedCamId);
                            }}
                            className="p-1.5 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
                            title={`Stop feed for ${assignedCamId}`}
                          >
                            <IconSquare size={13} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartSingleVideo(vid);
                            }}
                            className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                            title={`Start individual stream for ${assignedCamId}`}
                          >
                            <IconPlay size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleDeleteVideo(vid, e)}
                          className="p-1.5 rounded hover:bg-rose-100 text-stone-400 hover:text-rose-600 cursor-pointer"
                          title={`Delete '${vid.filename}' from uploads`}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 4: VIDEO PREVIEW */}
          {selectedVideo && previewVideoUrl && (
            <div className="bg-[#FAF9F5] p-3.5 rounded-xl border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-navy-800 text-[11px] uppercase tracking-wider">
                  Selected Video Preview: {selectedVideo.filename}
                </span>
                <span className="text-[10px] font-mono text-navy-500">
                  Assigned ID: {selectedVideo.camera_id || "SIM-CAM"} • Size: {selectedVideo.size_formatted}
                </span>
              </div>
              <div className="relative aspect-video max-h-48 rounded-lg overflow-hidden bg-navy-950 flex items-center justify-center">
                <video
                  key={previewVideoUrl}
                  src={previewVideoUrl}
                  controls
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-stone-200 bg-[#FAF9F5] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-navy-600 font-medium">Fleet Status:</span>
            {streamStatus.is_streaming ? (
              <span className="flex items-center gap-1.5 font-bold text-emerald-800 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                Active Simulated Streams Running ({streamStatus.active_count} of {videos.length})
              </span>
            ) : (
              <span className="text-stone-600 font-semibold text-xs">
                {videos.length} Simulated Cameras Ready to Stream
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {streamStatus.is_streaming && (
              <button
                type="button"
                onClick={handleStopAllStreaming}
                disabled={isActionLoading}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                <IconSquare size={14} />
                <span>Stop All Streams</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleStartAllStreaming}
              disabled={isActionLoading || videos.length === 0}
              className="px-5 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 active:bg-navy-950 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isActionLoading ? (
                <IconRefresh size={14} className="animate-spin" />
              ) : (
                <IconPlay size={14} />
              )}
              <span>
                {streamStatus.is_streaming
                  ? "Restart All Feeds"
                  : `Start Test Streaming (${videos.length} Cameras)`}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-navy-800 font-semibold text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
