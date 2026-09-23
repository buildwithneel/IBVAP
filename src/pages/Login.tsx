import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InstitutionalEmblem } from "../components/EmblemMark";
import { IconAlertTriangle, IconShield } from "../components/Icons";
import logoImg from "../assets/ibvap-logo.png";

// Quick inline lock icon for form field decoration
function IconKey({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("SSB-SEC-8421");
  const [password, setPassword] = useState("••••••••••••");
  const [terminalPin, setTerminalPin] = useState("4102");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!loginId.trim() || !password.trim()) {
      setError("Please provide both Login ID and Password.");
      return;
    }
    setError("");
    setIsLoading(true);

    // Controlled realistic simulated authentication
    setTimeout(() => {
      setIsLoading(false);
      navigate("/dashboard");
    }, 400);
  }

  return (
    <div className="min-h-screen bg-gov-bg flex flex-col justify-between p-4 sm:p-6 lg:p-10 select-none">
      {/* Top Banner / Government Portal Heading */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between py-2 border-b border-navy-200">
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center px-2.5 py-1 rounded-md bg-navy-950 border border-navy-800 shadow-sm">
            <img
              src={logoImg}
              alt="IBVAP Logo"
              className="h-7 w-auto object-contain"
            />
          </div>
          <div className="hidden sm:block h-6 w-px bg-navy-200" />
          <InstitutionalEmblem size={34} />
          <div>
            <p className="text-xs font-semibold text-navy-900 tracking-wide uppercase">
              Government of India
            </p>
            <p className="text-[11px] text-navy-500">Ministry of Home Affairs</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-navy-500 bg-navy-100 px-2.5 py-1 rounded border border-navy-200">
          <span className="w-1.5 h-1.5 rounded-full bg-status-live animate-cctv-pulse" />
          <span>GATEWAY: SECURE-NODE-IN04</span>
        </div>
      </div>

      {/* Main Wireframe 2 Container: Left Institutional Branding, Right Login Panel */}
      <div className="w-full max-w-4xl mx-auto my-auto py-6">
        <div className="bg-gov-card rounded-xl border border-navy-200 shadow-govMd overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Left Column: Government / Institutional Identity (Wireframe 2 Left) */}
          <div className="md:col-span-6 bg-navy-900 text-white p-8 sm:p-10 flex flex-col justify-between border-b md:border-b-0 md:border-r border-navy-800">
            <div>
              {/* Primary Official System Logo */}
              <div className="mb-7 pb-6 border-b border-navy-800/80">
                <img
                  src={logoImg}
                  alt="IBVAP — Surveillance System (Safer Borders | Stronger India)"
                  className="w-full max-w-[280px] h-auto object-contain drop-shadow-md mix-blend-screen"
                />
              </div>

              <div className="flex items-center gap-3 mb-5">
                <InstitutionalEmblem size={38} inverted />
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-navy-300">
                    Ministry of Home Affairs
                  </h2>
                  <p className="text-[11px] text-navy-400">Government of India</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="inline-block px-2.5 py-0.5 rounded bg-navy-800 text-[11px] font-mono text-navy-300 border border-navy-700">
                  SYSTEM CODE: IBVAP-2026
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug">
                  Integrated Border Vigilance &amp; Analytics Platform
                </h1>
                <p className="text-xs text-navy-300 leading-relaxed pt-1">
                  Centralized multi-camera tactical CCTV surveillance, automated tripwire detection,
                  and perimeter situational awareness terminal for border control commands.
                </p>
              </div>
            </div>

            {/* Institutional Security Notice */}
            <div className="mt-8 pt-6 border-t border-navy-800 space-y-2">
              <div className="flex items-center gap-2 text-status-warn text-xs font-semibold">
                <IconShield size={14} />
                <span>RESTRICTED OFFICIAL ACCESS</span>
              </div>
              <p className="text-[11px] text-navy-400 leading-normal">
                This system is monitored under the Information Technology Act and Indian Official
                Secrets Act. Unauthorized access attempts are automatically logged and prosecuted.
              </p>
            </div>
          </div>

          {/* Right Column: Operator Login Form (Wireframe 2 Right) */}
          <div className="md:col-span-6 p-8 sm:p-10 flex flex-col justify-center bg-gov-card">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-navy-900 tracking-tight">Operator Login</h2>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-navy-100 text-navy-700 border border-navy-200">
                  AUTH v2.4
                </span>
              </div>
              <p className="text-xs text-navy-500">
                Enter your authorized security credentials to access the terminal.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Login ID Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="loginId"
                  className="block text-xs font-semibold text-navy-700 tracking-wide"
                >
                  Official Login ID / Service No.
                </label>
                <div className="relative">
                  <input
                    id="loginId"
                    type="text"
                    required
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="e.g. SSB-SEC-8421"
                    className="w-full px-3 py-2.5 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors font-mono"
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-navy-700 tracking-wide"
                  >
                    Security Password
                  </label>
                  <span className="text-[10px] text-navy-400">Case-sensitive</span>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter security passphrase"
                    className="w-full px-3 py-2.5 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {/* Terminal PIN / Checkpost Station Code */}
              <div className="space-y-1.5">
                <label
                  htmlFor="terminalPin"
                  className="block text-xs font-semibold text-navy-700 tracking-wide"
                >
                  Terminal Station PIN
                </label>
                <input
                  id="terminalPin"
                  type="password"
                  maxLength={6}
                  value={terminalPin}
                  onChange={(e) => setTerminalPin(e.target.value)}
                  placeholder="Station PIN"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-navy-300 bg-white text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-900/20 focus:border-navy-900 transition-colors font-mono"
                />
              </div>

              {/* Error Message Alert */}
              {error && (
                <div className="p-2.5 rounded-lg bg-status-criticalBg border border-status-critical/30 text-status-critical text-xs flex items-center gap-2">
                  <IconAlertTriangle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-navy-900 hover:bg-navy-800 active:bg-navy-950 text-white font-medium text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-2 shadow-sm focus:ring-2 focus:ring-navy-900/40"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Authenticating Credentials...</span>
                  </>
                ) : (
                  <>
                    <IconKey size={14} />
                    <span>Authorize &amp; Enter Dashboard</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-navy-100 flex items-center justify-between text-[11px] text-navy-400">
              <span>Security Protocol: TLS 1.3</span>
              <span>NIC / CERT-In Certified</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Notice */}
      <div className="w-full max-w-6xl mx-auto py-3 border-t border-navy-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-navy-500 gap-2">
        <p>© 2026 Integrated Border Vigilance &amp; Analytics Platform. Government of India.</p>
        <div className="flex items-center gap-4">
          <span>Control Room Operations</span>
          <span>•</span>
          <span>Helpdesk: Ext. 4100</span>
        </div>
      </div>
    </div>
  );
}
