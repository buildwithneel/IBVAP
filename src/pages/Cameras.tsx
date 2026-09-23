import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { mockCameras, mockSystemMetrics } from "../data/mockData";
import { Camera, CameraStatus } from "../types";
import { IconFilter, IconSearch } from "../components/Icons";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";

const statusCounts = (cameras: Camera[]) => ({
  ALL: cameras.length,
  ACTIVE: cameras.filter((c) => c.status === "ACTIVE").length,
  ALERT: cameras.filter((c) => c.status === "ALERT").length,
  OFFLINE: cameras.filter((c) => c.status === "OFFLINE").length,
  MAINTENANCE: cameras.filter((c) => c.status === "MAINTENANCE").length,
});

export default function Cameras() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | CameraStatus>("ALL");
  const cameraList: Camera[] = mockCameras;
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

  return (
    <Layout
      title="Perimeter Camera Fleet Management"
      subtitle="Hardware Telemetry, Optical Heartbeat & Network Stream Diagnostic Registry"
    >
      <div className="space-y-4">
        {/* Fleet Health Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Active", value: mockSystemMetrics.activeCameras, color: "text-status-live", bg: "bg-status-liveBg border-status-live/20" },
            { label: "Alert", value: cameraList.filter(c => c.status === "ALERT").length, color: "text-status-critical", bg: "bg-status-criticalBg border-status-critical/20" },
            { label: "Offline", value: mockSystemMetrics.offlineCameras, color: "text-navy-600", bg: "bg-navy-100 border-navy-200" },
            { label: "Maintenance", value: mockSystemMetrics.maintenanceCameras, color: "text-status-warn", bg: "bg-status-warnBg border-status-warn/20" },
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
                        <StatusBadge status={cam.status} />
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
    </Layout>
  );
}
