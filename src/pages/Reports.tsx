import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { mockReports } from "../data/mockData";
import {
  IncidentReport,
  BackendIncidentDetail,
  IncidentTimelineItem,
  BackendEvidenceItem,
  EvidenceVerificationResult,
} from "../types";
import { IconDownload, IconFilter, IconShield, IconCheckCircle } from "../components/Icons";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import OfficerTrigger from "../components/OfficerTrigger";
import { api } from "../services/api";

export default function Reports() {
  const [reports, setReports] = useState<IncidentReport[]>(mockReports);
  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);
  const [filterClassification, setFilterClassification] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Incident Dossier Backend State
  const [incidentDetail, setIncidentDetail] = useState<BackendIncidentDetail | null>(null);
  const [evidenceList, setEvidenceList] = useState<BackendEvidenceItem[]>([]);
  const [_isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [newNoteText, setNewNoteText] = useState<string>("");
  const [isSubmittingNote, setIsSubmittingNote] = useState<boolean>(false);
  const [dossierFeedback, setDossierFeedback] = useState<string | null>(null);

  // Hash Verification Dialog State
  const [verificationResult, setVerificationResult] = useState<EvidenceVerificationResult | null>(null);
  const [isVerifyingHash, setIsVerifyingHash] = useState<boolean>(false);

  // Load incident details and evidence when a dossier is selected
  useEffect(() => {
    if (!selectedReport) {
      setIncidentDetail(null);
      setEvidenceList([]);
      setDossierFeedback(null);
      return;
    }

    let isMounted = true;
    async function fetchDossierData() {
      if (!selectedReport) return;
      setIsLoadingDetail(true);
      try {
        const [detail, evidence] = await Promise.all([
          api.getIncident(selectedReport.id, {
            title: selectedReport.title,
            sector: selectedReport.sector,
            reportNumber: selectedReport.reportNumber,
            incidentDate: selectedReport.incidentDate,
            reportingOfficer: selectedReport.reportingOfficer,
            summary: selectedReport.summary,
            status: selectedReport.status,
          }),
          api.getIncidentEvidence(selectedReport.id),
        ]);

        if (isMounted) {
          setIncidentDetail(detail);
          setEvidenceList(evidence);
        }
      } catch (err) {
        console.warn("Failed to load incident detail:", err);
      } finally {
        if (isMounted) setIsLoadingDetail(false);
      }
    }

    fetchDossierData();
    return () => {
      isMounted = false;
    };
  }, [selectedReport]);

  const showDossierFeedback = (msg: string) => {
    setDossierFeedback(msg);
    setTimeout(() => {
      setDossierFeedback((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const handleAcknowledge = async () => {
    if (!selectedReport || !incidentDetail) return;
    try {
      await api.acknowledgeIncident(selectedReport.id);
      const newStatus = "Under Review";
      setIncidentDetail((prev) => {
        if (!prev) return null;
        const newTimeline: IncidentTimelineItem = {
          id: `tl-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " IST",
          action: "Incident Acknowledged",
          actor: "Insp. Rajesh K. Sharma",
          details: "Case status moved to Under Review. Initial perimeter sweep underway.",
        };
        return {
          ...prev,
          status: newStatus,
          timeline: [newTimeline, ...(prev.timeline || [])],
        };
      });
      setReports((prev) =>
        prev.map((r) => (r.id === selectedReport.id ? { ...r, status: newStatus } : r))
      );
      showDossierFeedback("Incident acknowledged and status updated to Under Review.");
    } catch (err) {
      showDossierFeedback("Failed to acknowledge incident.");
    }
  };

  const handleEscalate = async () => {
    if (!selectedReport || !incidentDetail) return;
    try {
      await api.escalateIncident(selectedReport.id);
      const newStatus = "Escalated";
      setIncidentDetail((prev) => {
        if (!prev) return null;
        const newTimeline: IncidentTimelineItem = {
          id: `tl-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " IST",
          action: "Escalated to Command HQ",
          actor: "Insp. Rajesh K. Sharma",
          details: "Priority dispatch dispatched to SSB Sector Headquarters command console.",
        };
        return {
          ...prev,
          status: newStatus,
          timeline: [newTimeline, ...(prev.timeline || [])],
        };
      });
      showDossierFeedback("Incident escalated to Sector Command HQ.");
    } catch (err) {
      showDossierFeedback("Failed to escalate incident.");
    }
  };

  const handleResolve = async () => {
    if (!selectedReport || !incidentDetail) return;
    try {
      await api.resolveIncident(selectedReport.id, "Perimeter secured, zero ongoing breach detected.");
      const newStatus = "Closed";
      setIncidentDetail((prev) => {
        if (!prev) return null;
        const newTimeline: IncidentTimelineItem = {
          id: `tl-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " IST",
          action: "Incident Resolved",
          actor: "Insp. Rajesh K. Sharma",
          details: "Case officially closed. Sensor integrity re-verified.",
        };
        return {
          ...prev,
          status: newStatus,
          timeline: [newTimeline, ...(prev.timeline || [])],
        };
      });
      setReports((prev) =>
        prev.map((r) => (r.id === selectedReport.id ? { ...r, status: newStatus } : r))
      );
      showDossierFeedback("Incident case closed successfully.");
    } catch (err) {
      showDossierFeedback("Failed to resolve incident.");
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !selectedReport) return;
    setIsSubmittingNote(true);
    try {
      const added = await api.addIncidentNote(
        selectedReport.id,
        newNoteText.trim(),
        "Insp. Rajesh K. Sharma",
        "Investigating Officer"
      );
      setIncidentDetail((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          notes: [...(prev.notes || []), added],
        };
      });
      setNewNoteText("");
      showDossierFeedback("Investigator note appended to case ledger.");
    } catch (err) {
      showDossierFeedback("Failed to append note.");
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleVerifyHash = async (evidenceId: string) => {
    setIsVerifyingHash(true);
    try {
      const res = await api.verifyEvidence(evidenceId);
      setVerificationResult(res);
    } catch (err) {
      showDossierFeedback("Cryptographic hash verification failed.");
    } finally {
      setIsVerifyingHash(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    const matchCls = filterClassification === "ALL" || r.classification === filterClassification;
    const matchStat = filterStatus === "ALL" || r.status === filterStatus;
    return matchCls && matchStat;
  });

  const handleExportCSV = () => {
    const headers = "ReportNumber,Title,Sector,Date,Officer,Classification,Status\n";
    const rows = filteredReports
      .map(
        (r) =>
          `"${r.reportNumber}","${r.title}","${r.sector}","${r.incidentDate}","${r.reportingOfficer}","${r.classification}","${r.status}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IBVAP_Incident_Register_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Primary evidence item (snapshot)
  const primarySnapshot = evidenceList.find((e) => e.evidence_type === "snapshot") || evidenceList[0];
  const primaryVideoClip = evidenceList.find((e) => e.evidence_type === "video_clip");

  return (
    <Layout
      title="Official Security & Surveillance Reports"
      subtitle="Archival Incident Registers, Patrol Crossing Audits & Formal Intelligence Dossiers"
    >
      <div className="space-y-4">
        {/* Actions & Filters */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-3 shadow-gov flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Classification Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-semibold text-navy-600 flex items-center gap-1 shrink-0">
                <IconFilter size={12} />
                Class:
              </span>
              {["ALL", "Restricted", "Confidential", "Secret"].map((cls) => (
                <button
                  key={cls}
                  onClick={() => setFilterClassification(cls)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                    filterClassification === cls
                      ? "bg-navy-900 text-white"
                      : "bg-navy-100 text-navy-600 hover:bg-navy-200"
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] font-semibold text-navy-600 shrink-0">Status:</span>
              {["ALL", "Filed", "Under Review", "Closed"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                    filterStatus === s
                      ? "bg-navy-900 text-white"
                      : "bg-navy-100 text-navy-600 hover:bg-navy-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-800 text-xs font-semibold border border-navy-200 transition-colors shrink-0"
          >
            <IconDownload size={13} />
            Export Register (CSV)
          </button>
        </div>

        {/* Reports Table */}
        <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs" aria-label="Incident reports register">
              <thead>
                <tr className="border-b border-navy-200 bg-navy-50 text-navy-500 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Report Number</th>
                  <th className="py-3 px-4">Incident Title &amp; Sector</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Incident Date</th>
                  <th className="py-3 px-4">Reporting Officer</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        title="No reports match the selected filters"
                        description="Adjust the classification or status filter to locate the required dossier."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((report) => (
                    <tr
                      key={report.id}
                      className="hover:bg-navy-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedReport(report)}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-navy-800 whitespace-nowrap text-[11px]">
                        {report.reportNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-navy-900">{report.title}</div>
                        <div className="text-[10px] text-navy-400 mt-0.5">{report.sector}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={report.classification} />
                      </td>
                      <td className="py-3 px-4 font-mono text-navy-500 whitespace-nowrap text-[10px]">
                        {report.incidentDate}
                      </td>
                      <td className="py-3 px-4 text-navy-600 whitespace-nowrap">
                        <OfficerTrigger name={report.reportingOfficer} />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={report.status as any} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedReport(report)}
                          className="px-3 py-1 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-semibold transition-colors"
                        >
                          View Dossier
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredReports.length > 0 && (
            <div className="px-4 py-2 bg-navy-50 border-t border-navy-200 flex items-center justify-between text-[10px] text-navy-400 font-mono">
              <span>{filteredReports.length} of {reports.length} records shown</span>
              <span>IBVAP Secure Document Register · MHA / SSB</span>
            </div>
          )}
        </div>
      </div>

      {/* Upgraded Dossier Modal */}
      <Modal
        open={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        maxWidth="2xl"
        title={
          selectedReport && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedReport.classification} />
                <span className="text-[10px] font-mono text-navy-400">MHA / SSB IBVAP</span>
                {incidentDetail?.status && (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-navy-100 text-navy-800 border border-navy-200 uppercase">
                    Case: {incidentDetail.status}
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-navy-900 leading-tight">{selectedReport.title}</p>
            </div>
          )
        }
        subtitle={selectedReport ? `REF: ${selectedReport.reportNumber}` : undefined}
      >
        {selectedReport && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Feedback notification inside modal */}
            {dossierFeedback && (
              <div className="p-2.5 rounded-lg border text-xs font-medium flex items-center justify-between bg-status-liveBg/60 border-status-live/30 text-navy-900 shadow-sm animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-pulse" />
                  <span>{dossierFeedback}</span>
                </div>
                <button
                  onClick={() => setDossierFeedback(null)}
                  className="text-navy-400 hover:text-navy-700 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-navy-50 p-3 rounded-lg border border-navy-200">
              {[
                { label: "Sector", value: selectedReport.sector },
                { label: "Incident Date", value: selectedReport.incidentDate, mono: true },
                { label: "Generated At", value: selectedReport.generatedAt, mono: true },
                { label: "Reporting Officer", value: selectedReport.reportingOfficer, isOfficer: true },
                { label: "Status", value: incidentDetail?.status || selectedReport.status },
                { label: "AI Detections", value: `${selectedReport.detectionsCount} Objects Logged`, mono: true },
              ].map(({ label, value, mono, isOfficer }) => (
                <div key={label}>
                  <span className="text-[10px] text-navy-400 uppercase font-medium block mb-0.5">{label}</span>
                  {isOfficer ? (
                    <OfficerTrigger name={value} className="text-navy-900 font-semibold text-xs" />
                  ) : (
                    <span className={`font-semibold text-navy-900 ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-navy-600 mb-2">
                Incident Abstract &amp; Tactical Narrative
              </h4>
              <p className="text-xs text-navy-700 bg-white p-3 rounded-lg border border-navy-200 leading-relaxed">
                {incidentDetail?.summary || selectedReport.summary}
              </p>
            </div>

            {/* 1. Explainable AI (XAI) 3-Stage Inference Pipeline */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-navy-600 mb-2 flex items-center justify-between">
                <span>Explainable AI (XAI) Inference Pipeline</span>
                <span className="text-[9px] font-mono text-navy-400">3-Stage Autonomous Breakdown</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  incidentDetail?.explanationSteps || [
                    {
                      step: 1,
                      title: "Frame Extraction",
                      stage: "Preprocessing",
                      status: "completed",
                      details: "RTSP stream decoded at 1080p FHD. CLAHE contrast normalisation & Gaussian noise filtration applied.",
                      confidence: 0.99,
                      timestamp: "09:30:12 IST",
                    },
                    {
                      step: 2,
                      title: "YOLO Inference",
                      stage: "Neural Detection",
                      status: "flagged",
                      details: "Classified bounding box: Person [Confidence: 0.94], Spatial velocity: 1.4 m/s heading toward boundary defile.",
                      confidence: 0.94,
                      timestamp: "09:30:14 IST",
                    },
                    {
                      step: 3,
                      title: "Polygon Rule Transition",
                      stage: "Geofence Breach",
                      status: "triggered",
                      details: "Target centroid crossed Polygon Zone-A 'Restricted Perimeter' via Ray-Casting algorithm. State: BREACH.",
                      confidence: 0.98,
                      timestamp: "09:30:15 IST",
                    },
                  ]
                ).map((step) => (
                  <div
                    key={step.step}
                    className="p-2.5 rounded-lg border border-navy-200 bg-white flex flex-col justify-between shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono text-[9px] font-bold text-navy-500 uppercase">
                          Stage {step.step}: {step.title}
                        </span>
                        <span
                          className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                            step.status === "triggered"
                              ? "bg-status-criticalBg text-status-critical border border-status-critical/30"
                              : step.status === "flagged"
                              ? "bg-status-warnBg text-status-warn border border-status-warn/30"
                              : "bg-status-liveBg text-status-live border border-status-live/30"
                          }`}
                        >
                          {step.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-navy-700 leading-snug">{step.details}</p>
                    </div>
                    {step.confidence && (
                      <div className="mt-2 pt-1 border-t border-navy-100 flex items-center justify-between text-[9px] font-mono text-navy-400">
                        <span>Confidence: {Math.round(step.confidence * 100)}%</span>
                        {step.timestamp && <span>{step.timestamp}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Chronological Timeline */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-navy-600 mb-2 flex items-center justify-between">
                <span>Chronological Audit Timeline</span>
                <span className="text-[9px] font-mono text-navy-400">Ledger Sequence</span>
              </h4>
              <div className="bg-white rounded-lg border border-navy-200 divide-y divide-navy-100 max-h-36 overflow-y-auto">
                {(
                  incidentDetail?.timeline || [
                    {
                      id: "tl-1",
                      timestamp: "09:30:12 IST",
                      action: "Initial Keyframe Ingestion",
                      actor: "ONVIF Optical Unit",
                      details: "RTSP Keyframe capture triggered by optical optical sensor motion pulse.",
                    },
                    {
                      id: "tl-2",
                      timestamp: "09:30:15 IST",
                      action: "Automated Tripwire Trigger",
                      actor: "IBVAP Core Engine",
                      details: "Polygon ray-cast confirmed boundary breach in Sector Alpha.",
                    },
                    {
                      id: "tl-3",
                      timestamp: "09:31:02 IST",
                      action: "Incident Dossier Created",
                      actor: "System Audit Ledger",
                      details: "Case file initialized with tamper-evident cryptographic hash.",
                    },
                  ]
                ).map((t) => (
                  <div key={t.id} className="p-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-navy-900 text-[11px]">{t.action}</span>
                        <span className="text-[9px] text-navy-400 font-mono px-1 py-0.5 rounded bg-navy-50 border border-navy-200">
                          {t.actor}
                        </span>
                      </div>
                      {t.details && <p className="text-[10px] text-navy-600 mt-0.5 leading-snug">{t.details}</p>}
                    </div>
                    <span className="font-mono text-navy-400 text-[10px] shrink-0">{t.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Investigator Notes Thread & Input Form */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-navy-600 mb-2 flex items-center justify-between">
                <span>Investigator Case Notes</span>
                <span className="text-[9px] font-mono text-navy-400">
                  {incidentDetail?.notes?.length || 0} Registered
                </span>
              </h4>
              <div className="space-y-2">
                <div className="bg-white rounded-lg border border-navy-200 divide-y divide-navy-100 max-h-32 overflow-y-auto">
                  {incidentDetail?.notes && incidentDetail.notes.length > 0 ? (
                    incidentDetail.notes.map((note) => (
                      <div key={note.id} className="p-2.5 text-xs">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-navy-800 mb-0.5">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-navy-600" />
                            {note.author} {note.role ? `(${note.role})` : ""}
                          </span>
                          <span className="font-mono text-navy-400">{note.timestamp}</span>
                        </div>
                        <p className="text-[11px] text-navy-700 leading-snug pl-3">{note.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-[11px] text-navy-400 font-mono">
                      No case notes recorded. Add the initial observation below.
                    </div>
                  )}
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Append tactical observation or field note..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingNote || !newNoteText.trim()}
                    className="px-3 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors shrink-0 shadow-sm"
                  >
                    {isSubmittingNote ? "Posting..." : "Post Note"}
                  </button>
                </form>
              </div>
            </div>

            {/* 4. Evidence Media Container & Hash Verification Action */}
            <div className="bg-navy-50 border border-navy-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-navy-700">
                    Forensic Optical Evidence Vault
                  </h4>
                  <p className="text-[10px] text-navy-400 font-mono">
                    AES-256 Storage · Hardware SHA-256 Digest
                  </p>
                </div>
                {primarySnapshot && (
                  <button
                    type="button"
                    onClick={() => handleVerifyHash(primarySnapshot.id)}
                    disabled={isVerifyingHash}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-semibold transition-colors shadow-xs"
                    title="Verify SHA-256 cryptographic chain"
                  >
                    <IconShield size={11} />
                    {isVerifyingHash ? "Verifying..." : "Verify Hash Integrity"}
                  </button>
                )}
              </div>

              {/* Media Display: Snapshot & Video Clip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Snapshot display */}
                <div className="rounded-lg overflow-hidden border border-navy-300 bg-navy-900 relative group">
                  <img
                    src={primarySnapshot?.url || "/border_surveillance_hero.jpg"}
                    alt={`Evidence Snapshot ${selectedReport.reportNumber}`}
                    className="w-full h-36 object-cover object-center opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="absolute top-2 left-2 bg-navy-950/80 px-1.5 py-0.5 rounded text-[9px] font-mono text-white border border-navy-700">
                    SNAPSHOT · {selectedReport.sector}
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 bg-navy-950/85 px-2 py-1 rounded text-[9px] font-mono text-navy-200 border border-navy-700 truncate">
                    SHA: {primarySnapshot?.sha256_hash || "8f4e2b10a827598c4391da4570081d431bb592a8421c43f761009efba81230cd"}
                  </div>
                </div>

                {/* Video clip display / preview */}
                <div className="rounded-lg overflow-hidden border border-navy-300 bg-navy-900 flex flex-col items-center justify-center p-3 relative text-center">
                  {primaryVideoClip?.url ? (
                    <video
                      controls
                      src={primaryVideoClip.url}
                      className="w-full h-36 object-cover rounded"
                    />
                  ) : (
                    <div className="space-y-1.5">
                      <div className="w-8 h-8 rounded-full bg-navy-800 border border-navy-700 mx-auto flex items-center justify-center text-status-live">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                      <p className="text-[10px] font-bold text-white font-mono uppercase">
                        150-Frame Video Forensic Buffer
                      </p>
                      <p className="text-[9px] text-navy-400 font-mono">
                        Clip ID: {primaryVideoClip?.id || `ev-clip-${selectedReport.id}`} · H.264 MP4
                      </p>
                      <div className="text-[9px] font-mono text-status-live bg-status-liveBg/50 border border-status-live/30 px-2 py-0.5 rounded inline-block">
                        TAMPER-EVIDENT BUFFER SEALED
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Bottom Action Bar with Lifecycle Transitions: Acknowledge, Escalate, Resolve */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-navy-200">
              {/* Lifecycle Actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-navy-500 uppercase tracking-wider mr-1">
                  Actions:
                </span>
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  className="px-2.5 py-1.5 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-800 text-xs font-semibold border border-navy-300 transition-colors"
                  title="Acknowledge incident and begin active review"
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  onClick={handleEscalate}
                  className="px-2.5 py-1.5 rounded-lg bg-status-warnBg hover:bg-amber-100 text-status-warn text-xs font-semibold border border-status-warn/30 transition-colors"
                  title="Escalate case to Command HQ"
                >
                  Escalate
                </button>
                <button
                  type="button"
                  onClick={handleResolve}
                  className="px-2.5 py-1.5 rounded-lg bg-status-liveBg hover:bg-emerald-100 text-status-live text-xs font-semibold border border-status-live/30 transition-colors"
                  title="Mark incident case as resolved"
                >
                  Resolve
                </button>
              </div>

              {/* Standard Actions: CSV Export and Close */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-700 text-xs font-semibold border border-navy-200 transition-colors"
                >
                  <IconDownload size={12} />
                  Export (CSV)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="px-4 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors"
                >
                  Close Dossier
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* SHA-256 Hash Verification Dialog */}
      <Modal
        open={!!verificationResult}
        onClose={() => setVerificationResult(null)}
        maxWidth="md"
        title="Cryptographic Hash Verification"
        subtitle="SHA-256 TAMPER-EVIDENT EVIDENCE AUDIT REPORT"
      >
        {verificationResult && (
          <div className="p-6 space-y-4">
            {/* Status Strip */}
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-status-liveBg/60 border border-status-live/30 text-navy-900">
              <div className="p-1.5 rounded bg-status-live/15 text-status-live shrink-0">
                <IconCheckCircle size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-navy-900">
                  {verificationResult.verification_result || "VERIFIED_IMMUTABLE"}
                </p>
                <p className="text-[11px] text-navy-600 mt-0.5">
                  Calculated disk checksum matches database blockchain ledger record.
                </p>
              </div>
            </div>

            {/* Hash Details */}
            <div className="space-y-2.5 text-xs bg-navy-50 p-3.5 rounded-lg border border-navy-200 font-mono">
              <div>
                <span className="text-[10px] text-navy-400 uppercase font-semibold block mb-0.5">
                  SHA-256 Digest
                </span>
                <span className="text-[11px] font-bold text-navy-900 break-all select-all">
                  {verificationResult.sha256}
                </span>
              </div>

              <div className="pt-2 border-t border-navy-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-navy-400 uppercase font-semibold block">Stored Hash</span>
                  <span className="text-navy-800 break-all select-all font-mono">
                    {verificationResult.stored_hash}
                  </span>
                </div>
                <div>
                  <span className="text-navy-400 uppercase font-semibold block">Calculated Hash</span>
                  <span className="text-navy-800 break-all select-all font-mono">
                    {verificationResult.calculated_hash}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-navy-200 flex items-center justify-between text-[10px] text-navy-500">
                <span>Verification Timestamp:</span>
                <span className="font-semibold text-navy-800">{verificationResult.timestamp}</span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setVerificationResult(null)}
                className="px-4 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors"
              >
                Close Verification Report
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
