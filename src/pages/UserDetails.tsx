import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { IconCheckCircle, IconShield } from "../components/Icons";
import { AuditRecord, AuditVerificationResponse, BackendUser } from "../types";
import { api } from "../services/api";

export default function UserDetails() {
  const navigate = useNavigate();
  const [user, setUser] = useState<BackendUser | null>(api.getStoredUser());

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [verificationData, setVerificationData] = useState<AuditVerificationResponse | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    setUser(api.getStoredUser());
  }, []);

  const displayName = user?.name || "Duty Officer";
  const initials = displayName
    .split(" ")
    .filter((w) => w.match(/^[A-Z]/i))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "DO";

  const permissions = (user?.permissions || ["view_feeds", "acknowledge_alerts", "tag_evidence"]).map(
    (p) => ({
      label: p.toUpperCase().replace(/_/g, " "),
      status: "Granted",
    })
  );

  useEffect(() => {
    let isMounted = true;
    async function loadAudit() {
      try {
        const logs = await api.getAuditLogs();
        if (isMounted && logs) setAuditLogs(logs);
      } catch (e) {
        console.warn("Error loading audit log:", e);
      }
    }
    loadAudit();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleVerifyAuditChain = async () => {
    setIsVerifying(true);
    try {
      const res = await api.verifyAuditChain();
      setVerificationData(res);
    } catch (e) {
      console.warn("Failed to verify audit chain:", e);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Layout
      title="Operator Security Dossier & Terminal Profile"
      subtitle="Officer Verification, Role Permissions & Cryptographic Terminal Access Audit"
    >
      <div className="max-w-4xl mx-auto space-y-5 animate-page-enter">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            ← Return to Command Dashboard
          </button>
        </div>

        {/* Main Officer ID Card */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-6 shadow-gov overflow-hidden relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-navy-200 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-navy-900 border-2 border-navy-700 flex items-center justify-center text-white text-2xl font-bold font-mono shrink-0 shadow-lg select-none">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-navy-900">{displayName}</h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-status-liveBg text-status-live border border-status-live/30">
                    <IconCheckCircle size={11} />
                    AUTHENTICATED SESSION
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-navy-600 mt-0.5">{user?.role || "Duty Officer"}</p>
                <p className="text-[11px] text-navy-400 font-mono mt-0.5">
                  BADGE NO: {user?.badgeNumber || "SSB-SEC-8421"}
                </p>
              </div>
            </div>

            <div className="sm:text-right space-y-1">
              <span className="text-[10px] font-mono text-navy-400 block uppercase tracking-wide">Unit / Division</span>
              <span className="text-xs font-semibold text-navy-900 block">{user?.unit || "Border Guarding Unit"}</span>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <IconShield size={12} className="text-navy-600" />
                <span className="text-[11px] font-semibold text-navy-700">{user?.role || "Operator"}</span>
              </div>
            </div>
          </div>

          {/* Attribute Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-5 text-xs">
            {[
              { label: "Email Address",        value: user?.email || "officer@ssb.gov.in" },
              { label: "Role / Designation",   value: user?.role || "Duty Officer" },
              { label: "Active Session IP",    value: "10.142.1.88", mono: true },
              { label: "Login Timestamp",      value: new Date().toLocaleTimeString("en-IN"), mono: true },
              { label: "Session Token",        value: api.getToken() ? "ACTIVE (Bearer JWT)" : "NOT AUTHENTICATED", mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label} className="bg-navy-50 p-3 rounded-lg border border-navy-200/80">
                <span className="text-navy-400 block text-[10px] uppercase font-semibold tracking-wide mb-0.5">
                  {label}
                </span>
                <span className={`font-semibold text-navy-900 ${mono ? "font-mono text-[11px]" : ""}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Access Permissions Matrix */}
        <div className="bg-gov-card rounded-xl border border-navy-200 p-5 shadow-gov space-y-3">
          <div className="flex items-center justify-between border-b border-navy-100 pb-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-navy-700">
              Assigned Terminal Capabilities
            </h3>
            <span className="text-[10px] font-mono text-navy-400 bg-navy-100 px-2 py-0.5 rounded border border-navy-200">
              {permissions.length} Granted
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {permissions.map((perm, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-navy-50 border border-navy-200/70 flex items-start justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-status-live" />
                  <span className="text-navy-700 text-[11px] leading-snug">{perm.label}</span>
                </div>
                <span className="shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-status-liveBg text-status-live border border-status-live/20 whitespace-nowrap">
                  GRANTED
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Session Activity & Audit Ledger Section */}
        <div className="bg-gov-card rounded-xl border border-navy-200 overflow-hidden shadow-gov">
          <div className="px-4 py-3 border-b border-navy-200 bg-navy-50 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-navy-700">
              Session Activity &amp; Audit Log
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleVerifyAuditChain}
                disabled={isVerifying}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-[10px] font-semibold transition-colors shadow-xs"
                title="Verify cryptographic SHA-256 audit ledger chain"
              >
                <IconShield size={11} />
                {isVerifying ? "Verifying..." : "Verify Audit Chain"}
              </button>
            </div>
          </div>

          {/* Verification Report Display Strip */}
          {verificationData && (
            <div className="px-4 py-2.5 bg-status-liveBg/50 border-b border-status-live/30 flex flex-wrap items-center justify-between gap-2 text-xs animate-fadeIn">
              <div className="flex items-center gap-2 flex-wrap">
                <IconCheckCircle size={14} className="text-status-live shrink-0" />
                <span className="font-bold text-navy-900 text-[11px]">
                  {verificationData.valid ? "AUDIT CHAIN VALID" : "AUDIT CHAIN INVALID / UNREACHABLE"}
                </span>
                <span className="text-navy-300">|</span>
                <span className="text-[10px] font-mono text-navy-600">
                  Records Checked: {verificationData.records_checked}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setVerificationData(null)}
                className="text-navy-400 hover:text-navy-700 text-xs px-1 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          <div className="divide-y divide-navy-100">
            {auditLogs.length === 0 ? (
              <div className="p-4 text-center text-xs text-navy-400 font-mono">
                No audit log records found in database.
              </div>
            ) : (
              auditLogs.map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="px-4 py-2 flex items-center justify-between gap-3 text-xs hover:bg-navy-50/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-navy-400 text-[10px] w-6 shrink-0">
                      #{entry.sequence.toString().padStart(2, "0")}
                    </span>
                    <span className="font-mono text-navy-500 text-[10px] shrink-0">
                      {entry.timestamp}
                    </span>
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-navy-800 text-[11px] font-medium truncate">
                        {entry.action}
                      </span>
                      <span className="text-[9px] text-navy-500 font-mono hidden sm:inline px-1 py-0.5 rounded bg-navy-100/70 border border-navy-200 shrink-0">
                        {entry.operator}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        entry.status === "OK" || entry.status === "SUCCESS"
                          ? "bg-status-liveBg text-status-live"
                          : entry.status === "ACK"
                          ? "bg-status-infoBg text-status-info"
                          : "bg-status-warnBg text-status-warn"
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
