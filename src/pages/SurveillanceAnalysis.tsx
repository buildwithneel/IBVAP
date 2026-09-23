import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { mockBoundingBoxes, mockCameras, mockDetections } from "../data/mockData";
import { DetectionItem } from "../types";
import { IconAnalysis } from "../components/Icons";
import StatusBadge from "../components/StatusBadge";

const typeStyle: Record<string, { badge: string; label: string }> = {
  breach:  { badge: "bg-status-critical text-white",                              label: "BREACH" },
  person:  { badge: "bg-navy-700 text-white",                                     label: "PERSON" },
  vehicle: { badge: "bg-status-info text-white",                                  label: "VEHICLE" },
  object:  { badge: "bg-status-warn text-white",                                  label: "OBJECT" },
};

export default function SurveillanceAnalysis() {
  const navigate = useNavigate();
  const [selectedDetection, setSelectedDetection] = useState<DetectionItem>(mockDetections[0]);
  const [detectionFilter, setDetectionFilter] = useState<"ALL" | "person" | "vehicle" | "breach">("ALL");
  const [tripwireBreach, setTripwireBreach] = useState(false);
  const [timestamp, setTimestamp] = useState("");

  const activeCamera =
    mockCameras.find((c) => c.id === selectedDetection.cameraId) || mockCameras[0];
  const activeBoxes = mockBoundingBoxes[activeCamera.id] || [];

  const filteredDetections =
    detectionFilter === "ALL"
      ? mockDetections
      : mockDetections.filter((d) => d.type === detectionFilter);

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

  // Simulate a tripwire breach for demo
  const simulateBreach = () => {
    setTripwireBreach(true);
    setTimeout(() => setTripwireBreach(false), 1400);
  };

  return (
    <Layout
      title="Surveillance Analysis & Computer Vision"
      subtitle="Automated Object Classification, Tripwire Telemetry & Vector Diagnostics"
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
                Surveillance Neural Engine — Edge Inference v3.1.4
              </p>
              <p className="text-[10px] text-navy-500 font-mono mt-0.5">
                Model: MobilePerimeter-ResNet50 &nbsp;|&nbsp; Precision: FP16 &nbsp;|&nbsp; Latency: 22ms/frame &nbsp;|&nbsp; GPU: 54°C
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status="ACTIVE" label="INFERENCE ACTIVE" />
            <button
              onClick={simulateBreach}
              className="px-3 py-1 rounded-lg bg-status-criticalBg hover:bg-status-criticalBg text-status-critical text-[11px] font-bold border border-status-critical/30 transition-colors hover:brightness-95"
              title="Simulate a tripwire breach for demo"
            >
              ⚡ Simulate Breach
            </button>
          </div>
        </div>

        {/* Main Split: Viewport + Telemetry / Events */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left 7: Analysis Viewport */}
          <div className="lg:col-span-7 space-y-3">
            <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
              {/* Viewport Header */}
              <div className="px-4 py-2.5 border-b border-navy-200 bg-navy-50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-navy-900 uppercase tracking-wide">
                    Analysis Viewport: {activeCamera.code}
                  </span>
                  <StatusBadge status={activeCamera.status} size="sm" />
                </div>
                <div className="flex items-center gap-2 font-mono text-navy-400">
                  <span>{activeCamera.postNumber}</span>
                  <span>·</span>
                  <span>{timestamp}</span>
                </div>
              </div>

              {/* Viewport Canvas */}
              <div className="relative aspect-video w-full bg-navy-950 overflow-hidden select-none">
                {/* Background */}
                <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-slate-900 to-navy-950">
                  <div
                    className="absolute inset-0 opacity-[0.07]"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                      backgroundSize: "36px 36px",
                    }}
                  />
                  {/* Crosshair */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                    <div className="w-14 h-14 border border-white/50 rounded-full" />
                    <div className="absolute w-20 h-px bg-white/30" />
                    <div className="absolute h-20 w-px bg-white/30" />
                  </div>
                </div>

                {/* Border scenery SVG */}
                <svg
                  className="absolute inset-0 w-full h-full opacity-25 pointer-events-none"
                  preserveAspectRatio="none"
                  viewBox="0 0 1000 600"
                >
                  <path d="M0,360 L120,330 L300,350 L520,310 L750,340 L1000,320 L1000,600 L0,600 Z" fill="#1e293b" />
                  {[60, 160, 260, 360, 460, 560, 660, 760, 860, 960].map((x) => (
                    <g key={x}>
                      <line x1={x} y1="340" x2={x} y2="520" stroke="#475569" strokeWidth="2.5" />
                      <circle cx={x} cy="340" r="3" fill="#64748b" />
                    </g>
                  ))}
                  <line x1="0" y1="360" x2="1000" y2="360" stroke="#64748b" strokeWidth="1" strokeDasharray="6 3" />
                  <line x1="0" y1="410" x2="1000" y2="410" stroke="#64748b" strokeWidth="1" strokeDasharray="6 3" />
                </svg>

                {/* Tripwire Line */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line
                    x1="0" y1="65" x2="100" y2="58"
                    stroke={tripwireBreach ? "#DC2626" : "#DC2626"}
                    strokeWidth={tripwireBreach ? "1.4" : "0.8"}
                    strokeDasharray={tripwireBreach ? "none" : "2 1.5"}
                    className={tripwireBreach ? "animate-tripwire-breach" : ""}
                    style={{ transition: "stroke-width 0.3s" }}
                  />
                  <text x="3" y="62.5" fill={tripwireBreach ? "#EF4444" : "#DC2626"} fontSize="2.4" fontFamily="monospace" fontWeight="bold">
                    ⚡ PERIMETER BUFFER TRIPWIRE [50m RESTRICTED ZONE]
                  </text>
                  {tripwireBreach && (
                    <text x="3" y="69" fill="#FECACA" fontSize="2.8" fontFamily="monospace" fontWeight="bold">
                      !! BREACH DETECTED — QRT ALERT DISPATCHED
                    </text>
                  )}
                </svg>

                {/* Bounding Boxes */}
                {activeBoxes.map((box, idx) => {
                  const isCrit = box.type === "breach";
                  return (
                    <div
                      key={idx}
                      className={`absolute border-2 transition-all duration-300 ${
                        isCrit
                          ? "border-status-critical bg-status-critical/12"
                          : "border-status-live bg-status-live/12"
                      }`}
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                    >
                      {/* Corner ticks */}
                      <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white/80" />
                      <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white/80" />
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white/80" />
                      <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white/80" />
                      <span className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-tight whitespace-nowrap shadow-sm ${isCrit ? "bg-status-critical text-white" : "bg-status-live text-white"}`}>
                        {box.label}
                      </span>
                    </div>
                  );
                })}

                {/* OSD Telemetry bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between text-[10px] font-mono text-navy-300 bg-black/70 border-t border-white/10 z-10">
                  <span>VECTOR: 1.4 m/s EASTWARD</span>
                  <span>CONF: {Math.round(selectedDetection.confidence * 100)}%</span>
                  <span>TS: {selectedDetection.timestamp}</span>
                  <span>ENC: AES-256</span>
                </div>
              </div>
            </div>

            {/* Inspection Summary */}
            <div className="bg-gov-card rounded-xl border border-navy-200 p-4 shadow-gov">
              <div className="flex items-center justify-between border-b border-navy-100 pb-2.5 mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-navy-700">
                  Inspection Summary
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-navy-500 bg-navy-100 px-2 py-0.5 rounded border border-navy-200">
                    {selectedDetection.id}
                  </span>
                  <button
                    onClick={() => navigate("/dashboard/reports")}
                    className="px-2.5 py-1 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-medium transition-colors"
                  >
                    → Generate Dossier
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  { label: "Classification", value: selectedDetection.type.toUpperCase() },
                  { label: "Confidence", value: `${(selectedDetection.confidence * 100).toFixed(1)}%`, mono: true },
                  { label: "Sector", value: selectedDetection.sector },
                  {
                    label: "Severity",
                    value: selectedDetection.severity,
                    color:
                      selectedDetection.severity === "critical"
                        ? "text-status-critical font-bold"
                        : selectedDetection.severity === "warn"
                        ? "text-status-warn font-semibold"
                        : "text-status-live",
                  },
                ].map(({ label, value, mono, color }) => (
                  <div key={label} className="bg-navy-50 p-2.5 rounded-lg border border-navy-200/70">
                    <span className="text-[10px] text-navy-400 uppercase font-medium block mb-1">{label}</span>
                    <span className={`font-semibold ${mono ? "font-mono" : ""} ${color ?? "text-navy-900"}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 p-2.5 bg-navy-50 rounded-lg border border-navy-200/60">
                <span className="text-[10px] text-navy-400 font-semibold uppercase block mb-1">
                  AI Detection Notes
                </span>
                <p className="text-xs text-navy-700 leading-relaxed">{selectedDetection.details}</p>
              </div>
            </div>
          </div>

          {/* Right 5: Detection Telemetry Log */}
          <div className="lg:col-span-5">
            <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
              <div className="px-4 py-2.5 border-b border-navy-200 bg-navy-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-info animate-cctv-pulse" />
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-navy-800">
                    Detection Telemetry Log
                  </h3>
                </div>
                <div className="flex items-center gap-0.5">
                  {(["ALL", "breach", "person", "vehicle"] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setDetectionFilter(filter)}
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-colors ${
                        detectionFilter === filter
                          ? "bg-navy-800 text-white"
                          : "text-navy-500 hover:bg-navy-200"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-navy-100 max-h-[620px] overflow-y-auto">
                {filteredDetections.map((det) => {
                  const isSelected = det.id === selectedDetection.id;
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
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
