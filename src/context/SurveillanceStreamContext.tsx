import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Camera, TestStreamStatus } from "../types";
import { api } from "../services/api";
import { wsService } from "../services/websocket";

export type StreamMode = "pipeline" | "raw";

export interface SurveillanceStreamContextType {
  cameraList: Camera[];
  activeCameraId: string | null;
  activeCamera: Camera | null;
  setActiveCameraId: (id: string) => void;
  streamMode: StreamMode;
  setStreamMode: (mode: StreamMode) => void;
  toggleStreamMode: () => void;
  streamRevision: number;
  incrementStreamRevision: () => void;
  streamStatus: TestStreamStatus;
  refreshCameras: () => Promise<void>;
  isLoading: boolean;
  switchStreamVideo: (videoId: string, targetCameraId?: string) => Promise<any>;
}

const SurveillanceStreamContext = createContext<SurveillanceStreamContextType | undefined>(undefined);

const ACTIVE_CAM_KEY = "ibvap_active_camera_id";
const STREAM_MODE_KEY = "ibvap_stream_mode";

export const SurveillanceStreamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cameraList, setCameraList] = useState<Camera[]>([]);
  const [streamRevision, setStreamRevision] = useState<number>(() => Date.now());
  const [activeCameraId, setActiveCameraIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_CAM_KEY);
    } catch {
      return null;
    }
  });

  const [streamMode, setStreamModeState] = useState<StreamMode>(() => {
    try {
      const saved = localStorage.getItem(STREAM_MODE_KEY);
      return saved === "raw" ? "raw" : "pipeline";
    } catch {
      return "pipeline";
    }
  });

  const [streamStatus, setStreamStatus] = useState<TestStreamStatus>({
    is_streaming: false,
    status: "STOPPED",
    active_count: 0,
    active_streams: [],
    available_videos_count: 0,
  });

  const [isLoading, setIsLoading] = useState(true);

  const setActiveCameraId = useCallback((id: string) => {
    setActiveCameraIdState(id);
    try {
      localStorage.setItem(ACTIVE_CAM_KEY, id);
      window.dispatchEvent(new CustomEvent("ibvap_camera_changed", { detail: { id } }));
    } catch (e) {
      console.warn("Could not save active camera ID to localStorage:", e);
    }
  }, []);

  const setStreamMode = useCallback((mode: StreamMode) => {
    setStreamModeState(mode);
    try {
      localStorage.setItem(STREAM_MODE_KEY, mode);
      window.dispatchEvent(new CustomEvent("ibvap_stream_mode_changed", { detail: { mode } }));
    } catch (e) {
      console.warn("Could not save stream mode to localStorage:", e);
    }
  }, []);

  const incrementStreamRevision = useCallback(() => {
    const rev = Date.now();
    setStreamRevision(rev);
    try {
      window.dispatchEvent(
        new CustomEvent("ibvap_stream_revision_changed", { detail: { revision: rev } })
      );
    } catch {}
  }, []);

  const toggleStreamMode = useCallback(() => {
    setStreamMode(streamMode === "pipeline" ? "raw" : "pipeline");
  }, [streamMode, setStreamMode]);

  const refreshCameras = useCallback(async () => {
    try {
      const [camsRes, statusRes] = await Promise.allSettled([
        api.getCameras(),
        api.getTestStreamingStatus(),
      ]);

      let updatedCams: Camera[] = [];
      if (camsRes.status === "fulfilled" && Array.isArray(camsRes.value)) {
        updatedCams = camsRes.value;
        setCameraList(updatedCams);
        setStreamRevision(Date.now());

        setActiveCameraIdState((currentId) => {
          if (currentId && updatedCams.some((c) => c.id === currentId)) {
            return currentId;
          }
          // Default to first active simulated camera or first camera
          const simActive = updatedCams.find(
            (c) => (c.isSimulated || c.sourceType === "file") && c.status === "ACTIVE"
          );
          const firstCam = simActive || updatedCams[0];
          if (firstCam) {
            try {
              localStorage.setItem(ACTIVE_CAM_KEY, firstCam.id);
            } catch {}
            return firstCam.id;
          }
          return null;
        });
      }

      if (statusRes.status === "fulfilled" && statusRes.value) {
        setStreamStatus(statusRes.value);
      }
    } catch (err) {
      console.warn("Error refreshing surveillance cameras/streams:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchStreamVideo = useCallback(
    async (videoId: string, targetCameraId?: string) => {
      try {
        const payload: any = {
          video_id: videoId,
          loop: true,
        };
        if (targetCameraId || activeCameraId) {
          payload.camera_id = targetCameraId || activeCameraId;
        }

        const res = await api.startTestStreaming(payload);
        await refreshCameras();
        if (res?.camera_id) {
          setActiveCameraId(res.camera_id);
        }
        incrementStreamRevision();
        return res;
      } catch (err) {
        console.error("Failed to switch stream video:", err);
        throw err;
      }
    },
    [activeCameraId, refreshCameras, setActiveCameraId, incrementStreamRevision]
  );

  // Initial load and periodic stream sync
  useEffect(() => {
    refreshCameras();

    const intervalId = setInterval(() => {
      api.getTestStreamingStatus().then((s) => {
        if (s) setStreamStatus(s);
      }).catch(() => {});
    }, 5000);

    return () => clearInterval(intervalId);
  }, [refreshCameras]);

  // Sync across tabs / components via CustomEvent and StorageEvent
  useEffect(() => {
    const handleCameraChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id && detail.id !== activeCameraId) {
        setActiveCameraIdState(detail.id);
      }
    };

    const handleModeChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.mode && detail.mode !== streamMode) {
        setStreamModeState(detail.mode);
      }
    };

    const handleRevChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.revision && detail.revision !== streamRevision) {
        setStreamRevision(detail.revision);
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_CAM_KEY && e.newValue) {
        setActiveCameraIdState(e.newValue);
      }
      if (e.key === STREAM_MODE_KEY && (e.newValue === "pipeline" || e.newValue === "raw")) {
        setStreamModeState(e.newValue);
      }
    };

    window.addEventListener("ibvap_camera_changed", handleCameraChanged);
    window.addEventListener("ibvap_stream_mode_changed", handleModeChanged);
    window.addEventListener("ibvap_stream_revision_changed", handleRevChanged);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("ibvap_camera_changed", handleCameraChanged);
      window.removeEventListener("ibvap_stream_mode_changed", handleModeChanged);
      window.removeEventListener("ibvap_stream_revision_changed", handleRevChanged);
      window.removeEventListener("storage", handleStorage);
    };
  }, [activeCameraId, streamMode, streamRevision]);

  // Listen to WebSocket camera lifecycle events for instant sync
  useEffect(() => {
    const checkRefresh = () => {
      refreshCameras();
    };

    const unsubscribeStatus = wsService.subscribeStatus((status) => {
      if (status === "connected") {
        refreshCameras();
      }
    });

    const lastTelemetryTimes = new Map<string, number>();

    const unsubscribeMessage = wsService.subscribeMessage((msg) => {
      if (
        msg.type === "CAMERA_STREAM_CHANGED" ||
        msg.type === "CAMERA_ONLINE" ||
        msg.type === "CAMERA_STOPPED" ||
        msg.type === "CAMERA_STARTED"
      ) {
        refreshCameras();
        incrementStreamRevision();
      } else if (msg.type === "CAMERA_HEARTBEAT" || msg.type === "TELEMETRY_UPDATE") {
        const now = Date.now();
        if (Array.isArray(msg.cameras)) {
          const telemMap = new Map(msg.cameras.map((c: any) => [c.camera_id || c.id, c]));
          msg.cameras.forEach((c: any) => {
            const cId = c.camera_id || c.id;
            if (c.status === "ONLINE" || c.status === "ACTIVE") {
              lastTelemetryTimes.set(cId, now);
            }
          });

          setCameraList((prevList) =>
            prevList.map((cam) => {
              const t = telemMap.get(cam.id);
              if (!t) return cam;
              const isOnline = t.status === "ONLINE" || t.status === "ACTIVE";
              return {
                ...cam,
                status: isOnline ? ("ACTIVE" as const) : ("OFFLINE" as const),
                fps: typeof t.fps === "number" ? t.fps : cam.fps,
                resolution: t.resolution || cam.resolution,
                personsActive: typeof t.active_tracks === "number" ? t.active_tracks : cam.personsActive,
                lastHeartbeat: t.timestamp
                  ? new Date(t.timestamp).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : cam.lastHeartbeat,
              };
            })
          );
        }

        if (typeof msg.active_count === "number") {
          setStreamStatus((prev) => ({
            ...prev,
            is_streaming: msg.active_count > 0,
            active_count: msg.active_count,
            status: msg.active_count > 0 ? "STREAMING" : "STOPPED",
          }));
        }
      }
    });

    // Detect genuinely disconnected cameras after 15 seconds without heartbeat
    const timeoutChecker = setInterval(() => {
      const now = Date.now();
      let changed = false;
      setCameraList((prevList) => {
        const updated = prevList.map((cam) => {
          if (cam.status === "ACTIVE") {
            const lastTime = lastTelemetryTimes.get(cam.id);
            if (lastTime && now - lastTime > 15000) {
              changed = true;
              return { ...cam, status: "OFFLINE" as const };
            }
          }
          return cam;
        });
        return changed ? updated : prevList;
      });
    }, 5000);

    // Also poll cameras every 12 seconds in case status changed
    const camPoll = setInterval(checkRefresh, 12000);

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      clearInterval(camPoll);
      clearInterval(timeoutChecker);
    };
  }, [refreshCameras, incrementStreamRevision]);

  const activeCamera =
    (activeCameraId ? cameraList.find((c) => c.id === activeCameraId) : null) ||
    cameraList[0] ||
    null;

  return (
    <SurveillanceStreamContext.Provider
      value={{
        cameraList,
        activeCameraId,
        activeCamera,
        setActiveCameraId,
        streamMode,
        setStreamMode,
        toggleStreamMode,
        streamRevision,
        incrementStreamRevision,
        streamStatus,
        refreshCameras,
        isLoading,
        switchStreamVideo,
      }}
    >
      {children}
    </SurveillanceStreamContext.Provider>
  );
};

export function useSurveillanceStream(): SurveillanceStreamContextType {
  const context = useContext(SurveillanceStreamContext);
  if (!context) {
    throw new Error("useSurveillanceStream must be used within a SurveillanceStreamProvider");
  }
  return context;
};
