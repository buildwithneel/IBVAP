import { useState, useEffect } from "react";
import Layout from "../components/Layout";
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
import { wsService } from "../services/websocket";

export default function Reports() {
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(true);
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

  useEffect(() => {
    let isMounted = true;
    async function loadReports() {
      try {
        const [incRes, evtsRes, evdRes, alertsRes] = await Promise.allSettled([
          api.getIncidents(),
          api.getEvents({ limit: 100 }),
          api.getEvidenceList(),
          api.getAlerts(),
        ]);
        if (!isMounted) return;

        const incidents = incRes.status === "fulfilled" ? incRes.value : [];
        const events = evtsRes.status === "fulfilled" ? evtsRes.value : [];
        const evidenceItems = evdRes.status === "fulfilled" ? evdRes.value : [];
        const alerts = alertsRes.status === "fulfilled" ? alertsRes.value : [];

        const mappedReports: IncidentReport[] = [];
        const seenEventIds = new Set<string>();

        // 1. Process incidents first
        if (incidents && incidents.length > 0) {
          incidents.forEach((inc: any) => {
            const evId = inc.alertId || inc.event_id || inc.id;
            seenEventIds.add(evId);
            const ev = events.find((e: any) => e.id === evId);
            const evd = evidenceItems.find(
              (item: any) => item.id === inc.evidenceId || item.event_id === evId || (ev?.evidence_id && item.id === ev.evidence_id)
            );
            const sha256 = evd?.sha256 || ev?.evidence?.sha256 || ev?.extra_data?.evidence?.sha256 || ev?.event_hash || "N/A";
            const dateStr = inc.detectedAt ? inc.detectedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
            const snapUrl = evd?.image_path || ev?.snapshot_url || ev?.evidence?.snapshot_url || ev?.extra_data?.snapshot_url;
            const plateImg = evd?.plate_image_path || ev?.plate_image_url || ev?.evidence?.plate_image_url;

            mappedReports.push({
              id: inc.id,
              eventId: evId,
              evidenceId: inc.evidenceId || evd?.id || ev?.evidence_id,
              reportNumber: `IR-${inc.id.slice(-6).toUpperCase()}`,
              title: inc.title || `${inc.type || ev?.event_type || 'Surveillance'} Incident`,
              sector: inc.sector || ev?.sector || "Sector Alpha",
              incidentDate: dateStr,
              generatedAt: inc.detectedAt || ev?.timestamp || new Date().toISOString(),
              reportingOfficer: inc.assignedTo || "Border Duty Officer",
              classification: (inc.severity === "critical" || ev?.severity === "CRITICAL") ? "Secret" : "Restricted",
              severity: (inc.severity || ev?.severity || "MEDIUM").toUpperCase(),
              status: inc.status === "resolved" ? "Closed" : (inc.status === "acknowledged" || inc.status === "under_review" || inc.status === "escalated") ? "Under Review" : "Filed",
              summary: inc.explanationSteps?.[0]?.description || inc.title || ev?.description || "Automated surveillance alert.",
              detectionsCount: 1,
              sha256: sha256,
              cameraId: inc.cameraId || inc.camera_id || ev?.camera_id || "CAM-01",
              cameraName: inc.cameraName || ev?.camera_name || inc.cameraId || ev?.camera_id || "Sector Camera",
              eventType: inc.type || ev?.event_type || "INTRUSION",
              snapshotUrl: snapUrl,
              plateImageUrl: plateImg,
              plateNumber: ev?.plate_number || inc.plateNumber,
              evidenceStatus: evd?.capture_status || ev?.evidence_status || (snapUrl ? "SUCCESS" : "PENDING")
            });
          });
        }

        // 2. Add remaining events not already linked to an incident
        if (events && events.length > 0) {
          events.forEach((ev: any) => {
            if (seenEventIds.has(ev.id)) return;
            seenEventIds.add(ev.id);
            const evd = evidenceItems.find(
              (item: any) => item.event_id === ev.id || (ev.evidence_id && item.id === ev.evidence_id)
            );
            const sha256 = evd?.sha256 || ev.evidence?.sha256 || ev.extra_data?.evidence?.sha256 || ev.event_hash || "N/A";
            const dateStr = ev.timestamp ? ev.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);
            const snapUrl = evd?.image_path || ev.snapshot_url || ev.evidence?.snapshot_url || ev.extra_data?.snapshot_url;
            const plateImg = evd?.plate_image_path || ev.plate_image_url || ev.evidence?.plate_image_url;

            mappedReports.push({
              id: ev.id,
              eventId: ev.id,
              evidenceId: ev.evidence_id || evd?.id,
              reportNumber: `EVT-${ev.id.slice(-6).toUpperCase()}`,
              title: `${(ev.event_type || 'Event').replace('_', ' ').toUpperCase()} - ${ev.camera_name || ev.camera_id}`,
              sector: ev.sector || "Sector Alpha",
              incidentDate: dateStr,
              generatedAt: ev.timestamp || new Date().toISOString(),
              reportingOfficer: "Autonomous Sensor",
              classification: ev.severity === "CRITICAL" ? "Secret" : "Restricted",
              severity: (ev.severity || "MEDIUM").toUpperCase(),
              status: ev.status === "resolved" ? "Closed" : ev.status === "acknowledged" ? "Under Review" : "Filed",
              summary: `${ev.event_type} detected on ${ev.camera_name || ev.camera_id}`,
              detectionsCount: 1,
              sha256: sha256,
              cameraId: ev.camera_id || "CAM-01",
              cameraName: ev.camera_name || ev.camera_id || "Sector Camera",
              eventType: ev.event_type || "SURVEILLANCE_EVENT",
              snapshotUrl: snapUrl,
              plateImageUrl: plateImg,
              plateNumber: ev.plate_number,
              evidenceStatus: evd?.capture_status || ev.evidence_status || (snapUrl ? "SUCCESS" : "PENDING")
            });
          });
        }

        // 3. Fallback to alerts if neither incidents nor events returned
        if (mappedReports.length === 0 && alerts && alerts.length > 0) {
          alerts.forEach((a) => {
            mappedReports.push({
              id: a.id,
              eventId: a.id,
              reportNumber: `IR-${a.id.slice(-6).toUpperCase()}`,
              title: a.title,
              sector: a.sector,
              incidentDate: new Date().toISOString().slice(0, 10),
              generatedAt: a.timestamp,
              reportingOfficer: a.assignedUnit || "Duty Officer",
              classification: a.severity === "critical" ? "Secret" : "Restricted",
              severity: a.severity.toUpperCase(),
              status: a.status === "resolved" ? "Closed" : a.status === "investigating" ? "Under Review" : "Filed",
              summary: a.description,
              detectionsCount: 1,
              sha256: (a as any).plateSha256 || (a as any).snapshotSha256 || (a as any).evidenceHash || "N/A",
              cameraId: a.cameraId || a.cameraCode,
              cameraName: a.cameraName || a.cameraCode,
              eventType: a.title,
              snapshotUrl: a.snapshotUrl,
              plateImageUrl: a.plateImageUrl,
              plateNumber: a.plateNumber,
              evidenceStatus: a.evidenceStatus
            });
          });
        }

        setReports(mappedReports);
      } catch (e) {
        console.warn("Failed to load forensic reports:", e);
      } finally {
        if (isMounted) setIsLoadingReports(false);
      }
    }

    loadReports();
    const interval = setInterval(loadReports, 5000);

    const unsubAlerts = wsService.subscribeAlerts(() => {
      loadReports();
    });

    const unsubMsg = wsService.subscribeMessage((msg) => {
      if (msg.type?.startsWith("alert") || msg.type === "SURVEILLANCE_EVENT") {
        loadReports();
      }
    });

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubAlerts();
      unsubMsg();
    };
  }, []);

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
          timestamp: new Date().toLocaleTimeString("en-IN"),
          action: "Incident Acknowledged",
          actor: "Duty Officer",
          details: "Case status moved to Under Review.",
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
          timestamp: new Date().toLocaleTimeString("en-IN"),
          action: "Escalated to Command HQ",
          actor: "Duty Officer",
          details: "Priority dispatch sent to Command HQ.",
        };
        return {
          ...prev,
          status: newStatus,
          timeline: [newTimeline, ...(prev.timeline || [])],
        };
      });
      showDossierFeedback("Incident escalated to Command HQ.");
    } catch (err) {
      showDossierFeedback("Failed to escalate incident.");
    }
  };

  const handleResolve = async () => {
    if (!selectedReport || !incidentDetail) return;
    try {
      await api.resolveIncident(selectedReport.id, "Resolved by operator.");
      const newStatus = "Closed";
      setIncidentDetail((prev) => {
        if (!prev) return null;
        const newTimeline: IncidentTimelineItem = {
          id: `tl-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString("en-IN"),
          action: "Incident Resolved",
          actor: "Duty Officer",
          details: "Case officially closed.",
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
        "Duty Officer",
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
      showDossierFeedback("Note appended to case file.");
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
    const headers = "ReportNumber,Title,EventID,Sector,Timestamp,Date,Officer,Classification,Status,SHA256Hash\n";
    const rows = filteredReports
      .map(
        (r) =>
          `"${r.reportNumber}","${r.title}","${r.eventId || r.id}","${r.sector}","${r.generatedAt}","${r.incidentDate}","${r.reportingOfficer}","${r.classification}","${r.status}","${r.sha256 || 'N/A'}"`
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
                  <th className="py-3 px-3">Report No.</th>
                  <th className="py-3 px-3">Event Type &amp; Camera</th>
                  <th className="py-3 px-3">Event ID &amp; Forensic Hash</th>
                  <th className="py-3 px-3">Severity</th>
                  <th className="py-3 px-3">Evidence Preview</th>
                  <th className="py-3 px-3">Timestamp</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {isLoadingReports ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="w-5 h-5 border-2 border-navy-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-mono text-navy-500">Loading forensic records &amp; evidence chain...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        title="No incident reports logged"
                        description="There are currently zero incident reports in the database."
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
                      <td className="py-3 px-3 font-mono font-bold text-navy-800 whitespace-nowrap text-[11px]">
                        {report.reportNumber}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-navy-800 text-white">
                            {report.eventType || "INCIDENT"}
                          </span>
                          <span className="font-semibold text-navy-900 text-xs">{report.cameraName}</span>
                        </div>
                        <div className="text-[10px] text-navy-400 mt-0.5 font-mono">{report.sector}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-[10px] font-semibold text-navy-800 truncate max-w-[130px]" title={report.eventId || report.id}>
                          {report.eventId || report.id}
                        </div>
                        <div className="font-mono text-[9px] text-navy-500 truncate max-w-[130px] flex items-center gap-1" title={report.sha256}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>{report.sha256 && report.sha256 !== "N/A" ? `${report.sha256.slice(0, 12)}...` : "HASH PENDING"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={(report.severity?.toLowerCase() as any) || (report.classification as any)} />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {report.snapshotUrl || report.plateImageUrl ? (
                          <div className="flex items-center gap-1.5">
                            <img
                              src={report.snapshotUrl || report.plateImageUrl}
                              alt="Evidence crop"
                              className="w-10 h-7 object-cover rounded border border-navy-300 bg-black shrink-0"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                            {report.plateNumber && (
                              <span className="font-mono text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.2 rounded">
                                {report.plateNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[9px] font-mono text-navy-400 bg-navy-100 px-1.5 py-0.5 rounded border border-navy-200">
                            NO SNAPSHOT
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-navy-500 whitespace-nowrap text-[10px]">
                        {report.generatedAt
                          ? new Date(report.generatedAt).toLocaleString("en-IN", {
                              hour12: false,
                              month: "short",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : report.incidentDate}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge status={report.status as any} />
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedReport(report)}
                          className="px-2.5 py-1 rounded bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-semibold transition-colors cursor-pointer"
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
              <span>IBVAP Secure Forensic Document Register</span>
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
                <span className="text-[10px] text-navy-400 font-medium">IBVAP Core Engine</span>
                {incidentDetail?.status && (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-navy-100 text-navy-800 border border-navy-200 uppercase">
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
                { label: "Incident Date", value: selectedReport.incidentDate, mono: false },
                { label: "Generated At", value: selectedReport.generatedAt, mono: true },
                { label: "Reporting Officer", value: selectedReport.reportingOfficer, isOfficer: true },
                { label: "Status", value: incidentDetail?.status || selectedReport.status },
                { label: "AI Detections", value: `${selectedReport.detectionsCount} Objects Logged`, mono: false },
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

            {/* Investigator Notes Thread & Input Form */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-navy-600 mb-2 flex items-center justify-between">
                <span>Investigator Case Notes</span>
                <span className="text-[9px] font-medium text-navy-500">
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
                    <div className="p-3 text-center text-[11px] text-navy-400">
                      No case notes recorded.
                    </div>
                  )}
                </div>

                <form onSubmit={handleAddNote} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Append observation or note..."
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

            {/* Evidence Media Container */}
            <div className="bg-navy-50 border border-navy-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-navy-700">
                    Forensic Evidence Vault
                  </h4>
                  <p className="text-[10px] text-navy-500 font-normal">
                    SHA-256 Verified Evidence Chain
                  </p>
                </div>
                {primarySnapshot && (
                  <button
                    type="button"
                    onClick={() => handleVerifyHash(primarySnapshot.id)}
                    disabled={isVerifyingHash}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-[10px] font-semibold transition-colors shadow-xs"
                  >
                    <IconShield size={11} />
                    {isVerifyingHash ? "Verifying..." : "Verify Hash Integrity"}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {primarySnapshot ? (
                  <div className="rounded-lg overflow-hidden border border-navy-300 bg-navy-900 relative group">
                    <img
                      src={
                        primarySnapshot.url ||
                        (primarySnapshot.image_path ? api.resolveMediaUrl(primarySnapshot.image_path) : undefined) ||
                        `${api.getBaseUrl()}/storage/snapshots/${primarySnapshot.id}.jpg`
                      }
                      alt={`Evidence Snapshot ${selectedReport.reportNumber}`}
                      className="w-full h-36 object-cover object-center opacity-90 group-hover:opacity-100 transition-opacity"
                    />
                    <div className="absolute top-2 left-2 bg-navy-950/80 px-1.5 py-0.5 rounded text-[9px] font-semibold text-white border border-navy-700">
                      SNAPSHOT · {selectedReport.sector}
                    </div>
                    <div className="absolute bottom-2 left-2 right-2 bg-navy-950/85 px-2 py-1 rounded text-[9px] font-mono text-navy-200 border border-navy-700 truncate">
                      SHA: {primarySnapshot.sha256_hash || primarySnapshot.sha256}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-navy-300 bg-navy-900 p-6 text-center text-xs text-navy-400">
                    No snapshot evidence attached.
                  </div>
                )}

                {primarySnapshot && (primarySnapshot.plate_image_url || primarySnapshot.plate_image_path) ? (
                  <div className="rounded-lg overflow-hidden border border-navy-300 bg-navy-900 relative group flex items-center justify-center p-2">
                    <img
                      src={
                        primarySnapshot.plate_image_url ||
                        (primarySnapshot.plate_image_path
                          ? api.resolveMediaUrl(primarySnapshot.plate_image_path)
                          : undefined)
                      }
                      alt="Plate Crop Evidence"
                      className="max-h-32 max-w-full object-contain filter contrast-125 select-none"
                    />
                    <div className="absolute top-2 left-2 bg-amber-950/80 px-1.5 py-0.5 rounded text-[9px] font-semibold text-amber-300 border border-amber-600/40">
                      CROPPED NUMBER PLATE
                    </div>
                    <div className="absolute bottom-2 left-2 right-2 bg-navy-950/85 px-2 py-1 rounded text-[9px] font-mono text-navy-200 border border-navy-700 truncate">
                      PLATE SHA: {primarySnapshot.plate_sha256 || "COMPUTED"}
                    </div>
                  </div>
                ) : primaryVideoClip ? (
                  <div className="rounded-lg overflow-hidden border border-navy-300 bg-navy-900 flex flex-col items-center justify-center p-3 relative text-center">
                    <video
                      controls
                      src={primaryVideoClip.url || `${api.getBaseUrl()}/storage/videos/${primaryVideoClip.id}.mp4`}
                      className="w-full h-36 object-cover rounded"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-navy-300 bg-navy-900 p-6 text-center text-xs text-navy-400 flex items-center justify-center">
                    No video evidence clip attached.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Bottom Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-navy-200">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  className="px-2.5 py-1.5 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-800 text-xs font-semibold border border-navy-300 transition-colors"
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  onClick={handleEscalate}
                  className="px-2.5 py-1.5 rounded-lg bg-status-warnBg hover:bg-amber-100 text-status-warn text-xs font-semibold border border-status-warn/30 transition-colors"
                >
                  Escalate
                </button>
                <button
                  type="button"
                  onClick={handleResolve}
                  className="px-2.5 py-1.5 rounded-lg bg-status-liveBg hover:bg-emerald-100 text-status-live text-xs font-semibold border border-status-live/30 transition-colors"
                >
                  Resolve
                </button>
              </div>

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
        subtitle="SHA-256 EVIDENCE INTEGRITY REPORT"
      >
        {verificationResult && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-status-liveBg/60 border border-status-live/30 text-navy-900">
              <div className="p-1.5 rounded bg-status-live/15 text-status-live shrink-0">
                <IconCheckCircle size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-navy-900">
                  {verificationResult.verification_result}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs bg-navy-50 p-3.5 rounded-lg border border-navy-200 font-mono">
              <div>
                <span className="text-[10px] text-navy-400 uppercase font-semibold block mb-0.5">
                  Calculated SHA-256
                </span>
                <span className="text-[11px] font-bold text-navy-900 break-all select-all">
                  {verificationResult.sha256}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setVerificationResult(null)}
                className="px-4 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors"
              >
                Close Report
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
