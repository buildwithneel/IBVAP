import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { IndiaGovEmblem, SSBEmblem, TricolorBar } from "../components/GovernmentEmblems";
import { IconAlertTriangle, IconShield } from "../components/Icons";
import { api } from "../services/api";
import logoImg from "../assets/ibvap-logo-transparent.png";
import heroImg from "../assets/border_surveillance_hero.jpg";

export default function Login() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("SSB-SEC-8421");
  const [password, setPassword] = useState("••••••••••••");
  const [terminalPin, setTerminalPin] = useState("4102");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!loginId.trim() || !password.trim()) {
      setError("Please provide both Login ID / Email and Security Password.");
      return;
    }
    setError("");
    setIsLoading(true);

    try {
      await api.login({
        badgeOrEmail: loginId.trim(),
        password: password.trim(),
        role: "Operator",
      });
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please verify credentials with Command Desk.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleGoogleSSO() {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      navigate("/dashboard");
    }, 400);
  }

  return (
    <div className="min-h-screen bg-[#F7F5EF] text-navy-950 font-sans flex flex-col justify-between p-3 sm:p-5 lg:p-8 select-none">
      {/* Top Government Official Header Bar */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between py-2 px-1">
        <div className="flex items-center gap-3">
          <IndiaGovEmblem size={34} />
          <div className="border-l border-stone-300 pl-3">
            <p className="text-[11px] font-semibold tracking-wider text-navy-900 uppercase">
              Government of India
            </p>
            <p className="text-[10px] text-navy-600">Ministry of Home Affairs · Sashastra Seema Bal</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-navy-700 bg-white/90 border border-stone-200/90 rounded-full px-3 py-1 shadow-sm font-semibold">
          <span className="w-2 h-2 rounded-full bg-status-live animate-cctv-pulse" />
          <span className="hidden sm:inline">TERMINAL GATEWAY:</span>
          <span className="font-mono text-navy-800">SECURE-NODE-IN04</span>
        </div>
      </header>

      {/* Main Split-Screen 21st.dev Style Container */}
      <main className="w-full max-w-7xl mx-auto my-auto py-4 sm:py-6">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-[0_12px_40px_-10px_rgba(15,23,42,0.07)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[660px]">
          
          {/* ======================================================== */}
          {/* LEFT SIDE: IBVAP BRANDING + AUTHENTICATION FORM (45%)    */}
          {/* ======================================================== */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="lg:col-span-6 xl:col-span-5 p-6 sm:p-10 lg:p-12 flex flex-col justify-between bg-white"
          >
            <div>
              {/* IBVAP Brand Mark */}
              <div className="flex items-center justify-between mb-8">
                <div className="inline-flex flex-col gap-1.5">
                  <div className="px-3 py-1 rounded-xl bg-navy-950 border border-navy-800 shadow-sm inline-flex items-center">
                    <img
                      src={logoImg}
                      alt="IBVAP Logo"
                      className="h-7 w-auto object-contain"
                    />
                  </div>
                  {/* Subtle Tricolor Accent Line beneath logo */}
                  <TricolorBar className="max-w-[140px]" />
                </div>

                <span className="text-[10px] font-semibold uppercase tracking-wider text-navy-600 bg-[#F7F5EF] border border-stone-200 px-2.5 py-1 rounded-lg">
                  Restricted Access
                </span>
              </div>

              {/* Welcome Heading */}
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-semibold text-navy-950 tracking-tight">
                  Welcome Back
                </h1>
                <p className="text-xs sm:text-sm text-navy-600 mt-1.5 leading-relaxed">
                  Access your authorized terminal and continue to your secure border surveillance workspace.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-status-criticalBg border border-status-critical/30 text-status-critical text-xs flex items-center gap-2 animate-alert-enter">
                  <IconAlertTriangle size={16} className="shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* Email / Officer ID Input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="loginId"
                    className="block text-xs font-semibold text-navy-800 tracking-wide"
                  >
                    Official Email or Service ID
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-navy-400">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <input
                      id="loginId"
                      type="text"
                      required
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="e.g. rajesh.sharma@ssb.gov.in or SSB-SEC-8421"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-stone-300/80 bg-[#FAF9F5] text-navy-950 placeholder:text-navy-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all font-medium"
                      autoComplete="username"
                    />
                  </div>
                </div>

                {/* Password Input with Visibility Toggle */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-xs font-semibold text-navy-800 tracking-wide"
                    >
                      Security Password
                    </label>
                    <span className="text-[10px] text-navy-400">Case-sensitive</span>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-navy-400">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your security passphrase"
                      className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-stone-300/80 bg-[#FAF9F5] text-navy-950 placeholder:text-navy-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all font-medium"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-navy-400 hover:text-navy-700 transition-colors focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Station PIN Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="terminalPin"
                      className="block text-xs font-semibold text-navy-800 tracking-wide"
                    >
                      Terminal Station PIN
                    </label>
                    <span className="text-[10px] text-navy-400">4-digit station code</span>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-navy-400">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="7.5" cy="15.5" r="5.5" />
                        <path d="m21 2-9.6 9.6" />
                        <path d="m15.5 7.5 3 3L22 7l-3-3" />
                      </svg>
                    </div>
                    <input
                      id="terminalPin"
                      type="password"
                      maxLength={6}
                      value={terminalPin}
                      onChange={(e) => setTerminalPin(e.target.value)}
                      placeholder="Station PIN"
                      className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-stone-300/80 bg-[#FAF9F5] text-navy-950 placeholder:text-navy-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/10 focus:border-blue-600 transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Remember Me & Reset Password Controls */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <label className="flex items-center gap-2 text-navy-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-stone-300 text-navy-900 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-[11px] font-medium">Keep me signed in</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowResetModal(true)}
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 transition-colors hover:underline underline-offset-2"
                  >
                    Forgot passphrase?
                  </button>
                </div>

                {/* Primary Sign In Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 px-5 rounded-xl bg-navy-900 hover:bg-navy-800 active:bg-navy-950 text-white font-semibold text-xs tracking-wider uppercase transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-navy-900/20"
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
                      <span>SIGN IN</span>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </>
                  )}
                </button>

                {/* SSO Divider */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-200" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-semibold text-navy-400">
                    <span className="bg-white px-3">Or continue with</span>
                  </div>
                </div>

                {/* Google Workspace / Gov.in SSO */}
                <button
                  type="button"
                  onClick={handleGoogleSSO}
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl border border-stone-200/90 bg-[#FAF9F5] hover:bg-stone-100/80 active:bg-stone-200/60 text-navy-800 font-semibold text-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-navy-300"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.43 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.16 0 9.94 0 12s.45 3.84 1.24 5.42l4.04-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.57 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continue with Gov.in / Google SSO</span>
                </button>
              </form>
            </div>

            {/* Bottom Security Credentials Notice */}
            <div className="mt-8 pt-4 border-t border-stone-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between text-[10px] text-navy-600 gap-1.5 font-medium">
              <div className="flex items-center gap-1.5">
                <IconShield size={12} className="text-navy-600" />
                <span>Security Protocol: TLS 1.3 · NIC / CERT-In Certified</span>
              </div>
              <span className="text-navy-500 font-mono">Shift Alpha · 48th Bn</span>
            </div>
          </motion.div>

          {/* ======================================================== */}
          {/* RIGHT SIDE: GOVERNMENT + SSB VISUAL IDENTITY (55%)      */}
          {/* ======================================================== */}
          <motion.div
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="lg:col-span-6 xl:col-span-7 relative min-h-[460px] lg:min-h-full bg-navy-950 overflow-hidden flex flex-col justify-between p-6 sm:p-10 lg:p-12 text-white border-t lg:border-t-0 lg:border-l border-stone-200/80"
          >
            {/* Real Border Surveillance Photographic Visual */}
            <div className="absolute inset-0 z-0">
              <img
                src={heroImg}
                alt="Himalayan Border Post Surveillance Mast and Perimeter Fencing"
                className="w-full h-full object-cover object-center transform scale-105 transition-transform duration-[12s] ease-out hover:scale-100"
              />
              {/* Soft Photographic Overlay — calibrated for light institutional ambiance */}
              <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-900/40 to-navy-950/30" />
              
              {/* Ambient slow scanning surveillance light trail (21st.dev inspired motion) */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/5 to-transparent h-32 w-full animate-cctv-pulse pointer-events-none" />
            </div>

            {/* TOP AREA: OFFICIAL GOVERNMENT + SSB LOGOS IN CORRESPONDING HIERARCHY */}
            <div className="relative z-10">
              <div className="bg-white/90 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/60 shadow-lg text-navy-950">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Government of India / MHA */}
                  <div className="flex items-center gap-3">
                    <IndiaGovEmblem size={40} />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-navy-950">
                        Government of India
                      </p>
                      <p className="text-[11px] text-navy-700 font-medium">Ministry of Home Affairs</p>
                    </div>
                  </div>

                  {/* Clean Vertical Divider */}
                  <div className="hidden sm:block h-9 w-px bg-stone-300" />

                  {/* Sashastra Seema Bal (SSB) Identity */}
                  <div className="flex items-center gap-3">
                    <SSBEmblem size={38} />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-navy-950">
                        Sashastra Seema Bal
                      </p>
                      <p className="text-[10px] text-navy-700 font-medium tracking-tight">
                        Border Guarding Force (SSB)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Subtle Tricolor Accent under top branding */}
                <TricolorBar className="mt-3.5" />
              </div>
            </div>

            {/* MIDDLE TELEMETRY BADGE: ACTIVE SURVEILLANCE RADAR STATUS */}
            <div className="relative z-10 my-auto py-6">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-navy-950/80 backdrop-blur-md border border-white/20 text-white shadow-md text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-status-live animate-cctv-pulse" />
                <span className="font-semibold tracking-wide">SECTOR ALPHA PERIMETER</span>
                <span className="text-white/40">|</span>
                <span className="text-emerald-400 font-mono text-[11px]">24 NODES ACTIVE</span>
              </div>
            </div>

            {/* BOTTOM GLASSMORPHISM CARD: IBVAP PLATFORM OVERVIEW */}
            <div className="relative z-10">
              <div className="bg-white/90 backdrop-blur-md rounded-2xl p-5 border border-white/80 shadow-xl text-navy-950">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-navy-900 text-white">
                      IBVAP
                    </span>
                    <h2 className="text-xs font-semibold text-navy-900 uppercase tracking-wider">
                      Intelligent Video Analytics Platform
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                    CV v3.1.4 ACTIVE
                  </span>
                </div>

                <p className="text-xs text-navy-700 leading-relaxed font-normal">
                  Tactical CCTV surveillance feed integration, automated tripwire breach detection,
                  and perimeter situational telemetry for Border Security Commands.
                </p>

                {/* Operational metrics summary */}
                <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-stone-200/80 text-center">
                  <div className="bg-[#FAF9F5] p-2 rounded-lg border border-stone-200/70">
                    <span className="text-[10px] text-navy-600 font-semibold block uppercase">Cameras</span>
                    <span className="text-xs font-semibold text-navy-950 font-mono">24/24 Online</span>
                  </div>
                  <div className="bg-[#FAF9F5] p-2 rounded-lg border border-stone-200/70">
                    <span className="text-[10px] text-navy-600 font-semibold block uppercase">Latency</span>
                    <span className="text-xs font-semibold text-navy-950 font-mono">38ms Stream</span>
                  </div>
                  <div className="bg-[#FAF9F5] p-2 rounded-lg border border-stone-200/70">
                    <span className="text-[10px] text-navy-600 font-semibold block uppercase">Breaches</span>
                    <span className="text-xs font-semibold text-emerald-800 font-mono">0 Uncontained</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer Official Notice */}
      <footer className="w-full max-w-7xl mx-auto py-2 px-1 flex flex-col sm:flex-row items-center justify-between text-[11px] text-navy-600 gap-1.5 border-t border-stone-200/80">
        <p>© 2026 Integrated Border Vigilance &amp; Analytics Platform (IBVAP). Ministry of Home Affairs, Government of India.</p>
        <div className="flex items-center gap-3 font-medium">
          <span>Official Secrets Act Compliant</span>
          <span>•</span>
          <span>Control Room Helpdesk: Ext. 4100</span>
        </div>
      </footer>

      {/* Reset Passphrase Accessible Dialog Modal */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-md w-full p-6 text-navy-950 animate-card-enter">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
                  <IconShield size={18} />
                </div>
                <h3 className="text-sm font-semibold text-navy-950">Security Credential Recovery</h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="p-1 rounded-lg text-navy-400 hover:text-navy-700 hover:bg-stone-100 transition-colors"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-navy-600 leading-relaxed">
              In accordance with Ministry of Home Affairs security policies, passphrases for border surveillance
              terminals cannot be reset online.
            </p>
            <div className="my-4 p-3 rounded-xl bg-[#FAF9F5] border border-stone-200 text-xs space-y-1">
              <p className="font-semibold text-navy-900">Contact Control Room Communications Desk:</p>
              <p className="text-navy-600 font-mono">Intercom: Ext. 4100 / 4102</p>
              <p className="text-navy-600 font-mono">Secure Intranet: ops-support@ssb.gov.in</p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
