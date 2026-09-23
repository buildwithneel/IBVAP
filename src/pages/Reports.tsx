import { useState } from "react";
import Layout from "../components/Layout";
import { mockReports } from "../data/mockData";
import { IncidentReport } from "../types";
import { IconDownload, IconFilter } from "../components/Icons";
import StatusBadge from "../components/StatusBadge";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import OfficerTrigger from "../components/OfficerTrigger";

export default function Reports() {
  const [reports] = useState<IncidentReport[]>(mockReports);
  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(null);
  const [filterClassification, setFilterClassification] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

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

      {/* Dossier Modal */}
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
              </div>
              <p className="text-sm font-bold text-navy-900 leading-tight">{selectedReport.title}</p>
            </div>
          )
        }
        subtitle={selectedReport ? `REF: ${selectedReport.reportNumber}` : undefined}
      >
        {selectedReport && (
          <div className="space-y-4">
            {/* Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-navy-50 p-3 rounded-lg border border-navy-200">
              {[
                { label: "Sector", value: selectedReport.sector },
                { label: "Incident Date", value: selectedReport.incidentDate, mono: true },
                { label: "Generated At", value: selectedReport.generatedAt, mono: true },
                { label: "Reporting Officer", value: selectedReport.reportingOfficer, isOfficer: true },
                { label: "Status", value: selectedReport.status },
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
                {selectedReport.summary}
              </p>
            </div>

            {/* Evidence Placeholder */}
            <div className="bg-navy-50 border border-dashed border-navy-300 rounded-lg p-4 text-center">
              <p className="text-[10px] font-semibold text-navy-500 uppercase tracking-wide">
                Optical Evidence Frame — {selectedReport.reportNumber}
              </p>
              <p className="text-[10px] text-navy-400 mt-1 font-mono">
                CCTV Frame Archive · AES-256 Encrypted · Chain of Custody Verified
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-navy-100">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-700 text-xs font-semibold border border-navy-200 transition-colors"
              >
                <IconDownload size={12} />
                Export Dossier (CSV)
              </button>
              <button
                onClick={() => setSelectedReport(null)}
                className="px-4 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors"
              >
                Close Dossier
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
