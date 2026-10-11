import React, { useState, useEffect } from "react";
import { IconPlay, IconSquare, IconVideo, IconRefresh } from "./Icons";
import { api } from "../services/api";
import { TestStreamStatus } from "../types";

interface TestStreamingControlBarProps {
  onOpenModal: () => void;
  onStreamChanged?: () => void;
  className?: string;
  variant?: "full" | "compact";
}

export default function TestStreamingControlBar({
  onOpenModal,
  onStreamChanged,
  className = "",
  variant = "full",
}: TestStreamingControlBarProps) {
  const [status, setStatus] = useState<TestStreamStatus>({
    is_streaming: false,
    status: "STOPPED",
    active_count: 0,
    active_streams: [],
    available_videos_count: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.getTestStreamingStatus();
      if (res) {
        setStatus(res);
      }
    } catch (e) {
      console.warn("Unable to fetch test streaming status:", e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleQuickToggle = async () => {
    setIsLoading(true);
    try {
      if (status.is_streaming) {
        await api.stopTestStreaming({ all: true });
        await fetchStatus();
        if (onStreamChanged) onStreamChanged();
      } else {
        // Quick start with first detected video or open modal
        const res = await api.startTestStreaming({ loop: true });
        await fetchStatus();
        if (onStreamChanged) onStreamChanged();
      }
    } catch (err) {
      console.warn("Test stream quick toggle failed:", err);
      // Fallback: open modal for manual video selection
      onOpenModal();
    } finally {
      setIsLoading(false);
    }
  };

  const isStreaming = status.is_streaming;

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Status indicator */}
        <span
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-colors ${
            isStreaming
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-stone-100 border-stone-200 text-stone-600"
          }`}
          title={isStreaming ? `Streaming ${status.active_count} simulated camera(s)` : "Simulated streaming stopped"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isStreaming ? "bg-emerald-600 animate-pulse" : "bg-stone-400"
            }`}
          />
          <span>{isStreaming ? `STREAMING (${status.active_count})` : "STOPPED"}</span>
        </span>

        {isStreaming ? (
          <button
            type="button"
            onClick={handleQuickToggle}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-[11px] font-semibold flex items-center gap-1 transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title="Stop Simulated CCTV Stream"
          >
            <IconSquare size={12} />
            <span>Stop Streaming</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenModal}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-navy-950 text-white text-[11px] font-semibold flex items-center gap-1 transition-all shadow-xs cursor-pointer disabled:opacity-50"
            title="Start Test Video Streaming"
          >
            <IconPlay size={12} />
            <span>Start Test Streaming</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 bg-[#FAF9F5] border border-stone-200/90 rounded-xl px-3 py-1.5 shadow-xs ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-navy-900 text-white flex items-center justify-center">
          <IconVideo size={13} />
        </span>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold tracking-wider text-navy-800 leading-tight">
            Test Streaming
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isStreaming ? "bg-emerald-600 animate-pulse" : "bg-stone-400"
              }`}
            />
            <span
              className={`text-[10px] font-mono font-semibold ${
                isStreaming ? "text-emerald-700" : "text-stone-500"
              }`}
            >
              Status: {isStreaming ? `Streaming (${status.active_count} active)` : "Stopped"}
            </span>
          </div>
        </div>
      </div>

      <div className="h-5 w-px bg-stone-300 mx-0.5 hidden sm:block" />

      <div className="flex items-center gap-1.5">
        {isStreaming ? (
          <button
            type="button"
            onClick={handleQuickToggle}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <IconRefresh size={13} className="animate-spin" />
            ) : (
              <IconSquare size={13} />
            )}
            <span>Stop Streaming</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenModal}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-navy-950 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <IconRefresh size={13} className="animate-spin" />
            ) : (
              <IconPlay size={13} />
            )}
            <span>Start Test Streaming</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenModal}
          className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-navy-800 text-xs font-medium transition-colors cursor-pointer"
          title="Configure Simulated Videos & Cameras"
        >
          <span>Select Video...</span>
        </button>
      </div>
    </div>
  );
}
