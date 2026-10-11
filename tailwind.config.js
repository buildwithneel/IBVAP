/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 60% — primary surfaces
        gov: {
          bg: "#F4F6F8",
          card: "#FFFFFF",
          subtle: "#F8FAFC",
        },
        // 30% — institutional structural ink & government navy
        navy: {
          950: "#090D16",
          900: "#0F172A",
          850: "#152033",
          800: "#1E293B",
          700: "#334155",
          600: "#475569",
          500: "#64748B",
          400: "#94A3B8",
          300: "#CBD5E1",
          200: "#E2E8F0",
          100: "#F1F5F9",
          50: "#F8FAFC",
        },
        // 10% — operational emphasis strictly for security alerts & live monitoring
        status: {
          live: "#15803D",      // restrained green
          liveBg: "#DCFCE7",
          liveBorder: "#86EFAC",
          warn: "#B45309",      // restrained amber
          warnBg: "#FEF3C7",
          warnBorder: "#FDE68A",
          critical: "#B91C1C",  // restrained red
          criticalBg: "#FEE2E2",
          criticalBorder: "#FECACA",
          info: "#1D4ED8",      // subdued government blue
          infoBg: "#DBEAFE",
          infoBorder: "#BFDBFE",
        },
      },
      fontFamily: {
        sans: [
          '"Noto Sans"',
          '"Segoe UI"',
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"IBM Plex Mono"',
          '"SFMono-Regular"',
          "Consolas",
          '"Liberation Mono"',
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        gov: "0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)",
        govMd: "0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)",
        govLg: "0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.05)",
      },
      transitionDuration: {
        "150": "150ms",
        "250": "250ms",
      },
    },
  },
  plugins: [],
};
