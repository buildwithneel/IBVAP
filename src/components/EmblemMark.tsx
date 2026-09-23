
export function InstitutionalEmblem({
  size = 56,
  className = "",
  inverted = false,
}: {
  size?: number;
  className?: string;
  inverted?: boolean;
}) {
  const strokeColor = inverted ? "#CBD5E1" : "#1E293B";
  const fillColor = inverted ? "rgba(255,255,255,0.06)" : "#F1F5F9";
  const accentColor = inverted ? "#94A3B8" : "#334155";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-label="Government Institutional Security Crest"
    >
      {/* Outer formal circular border */}
      <circle cx="50" cy="50" r="46" stroke={strokeColor} strokeWidth="2.5" fill={fillColor} />
      <circle cx="50" cy="50" r="41" stroke={strokeColor} strokeWidth="1" strokeDasharray="3 3" />

      {/* Central stylized pillar / chakra geometric motif */}
      <circle cx="50" cy="50" r="16" stroke={strokeColor} strokeWidth="2" fill="none" />
      <circle cx="50" cy="50" r="4" fill={strokeColor} />

      {/* 24 spokes (represented with 8 primary radial lines) */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 50 + 4 * Math.cos(rad);
        const y1 = 50 + 4 * Math.sin(rad);
        const x2 = 50 + 15 * Math.cos(rad);
        const y2 = 50 + 15 * Math.sin(rad);
        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={strokeColor}
            strokeWidth="1.5"
          />
        );
      })}

      {/* Decorative laurel / shield arc bottom */}
      <path
        d="M26 68 C 34 82, 66 82, 74 68"
        stroke={accentColor}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Top institutional star / chevron */}
      <polygon
        points="50,16 53,24 61,24 55,29 57,37 50,32 43,37 45,29 39,24 47,24"
        fill={accentColor}
      />
    </svg>
  );
}

import logoImg from "../assets/ibvap-logo.png";

export function IBVAPLogo({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const heightClasses = {
    sm: "h-7",
    md: "h-10",
    lg: "h-14",
  }[size];

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src={logoImg}
        alt="IBVAP — Surveillance System (Safer Borders | Stronger India)"
        className={`${heightClasses} w-auto max-w-[200px] object-contain select-none mix-blend-screen`}
      />
    </div>
  );
}


