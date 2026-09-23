export function IndiaGovEmblem({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 115"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="State Emblem of India"
    >
      {/* Central Lion Capital silhouette */}
      <path
        d="M50 8 C46 8, 42 12, 42 17 C42 22, 45 25, 47 27 C44 28, 40 32, 41 38 C42 42, 45 44, 48 45 C46 47, 43 51, 44 56 C45 61, 48 63, 50 63 C52 63, 55 61, 56 56 C57 51, 54 47, 52 45 C55 44, 58 42, 59 38 C60 32, 56 28, 53 27 C55 25, 58 22, 58 17 C58 12, 54 8, 50 8 Z"
        fill="#1E293B"
      />
      {/* Left Lion Head & Mane */}
      <path
        d="M36 20 C32 18, 27 22, 27 27 C27 33, 31 37, 34 38 C30 40, 27 45, 29 51 C30 55, 34 58, 38 58 C39 52, 41 46, 42 41 C39 37, 38 31, 39 26 C38 23, 37 21, 36 20 Z"
        fill="#334155"
      />
      {/* Right Lion Head & Mane */}
      <path
        d="M64 20 C68 18, 73 22, 73 27 C73 33, 69 37, 66 38 C70 40, 73 45, 71 51 C70 55, 66 58, 62 58 C61 52, 59 46, 58 41 C61 37, 62 31, 61 26 C62 23, 63 21, 64 20 Z"
        fill="#334155"
      />
      {/* Abacus Platform */}
      <rect x="22" y="65" width="56" height="12" rx="2" fill="#1E293B" />
      {/* Ashoka Chakra in Center */}
      <circle cx="50" cy="71" r="5" stroke="#F8FAFC" strokeWidth="1" fill="#0F172A" />
      <circle cx="50" cy="71" r="1.5" fill="#38BDF8" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((ang) => (
        <line
          key={ang}
          x1={50 + 1.5 * Math.cos((ang * Math.PI) / 180)}
          y1={71 + 1.5 * Math.sin((ang * Math.PI) / 180)}
          x2={50 + 4.8 * Math.cos((ang * Math.PI) / 180)}
          y2={71 + 4.8 * Math.sin((ang * Math.PI) / 180)}
          stroke="#F8FAFC"
          strokeWidth="0.6"
        />
      ))}
      {/* Galloping Horse Left */}
      <path d="M28 72 C26 70, 32 68, 34 71 C32 72, 30 73, 28 72 Z" fill="#94A3B8" />
      {/* Bull Right */}
      <path d="M72 72 C74 70, 68 68, 66 71 C68 72, 70 73, 72 72 Z" fill="#94A3B8" />
      {/* Base Bell Lotus */}
      <path
        d="M26 77 C32 85, 68 85, 74 77 L71 82 C64 88, 36 88, 29 82 Z"
        fill="#334155"
      />
      {/* Satyameva Jayate Banner */}
      <rect x="20" y="90" width="60" height="9" rx="1.5" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="0.8" />
      <text
        x="50"
        y="96.5"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="600"
        fill="#0F172A"
        fontFamily="sans-serif"
        letterSpacing="0.4"
      >
        सत्यमेव जयते
      </text>
    </svg>
  );
}

export function SSBEmblem({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 115"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Sashastra Seema Bal Insignia"
    >
      {/* Outer Golden Wreath Arc */}
      <circle cx="50" cy="52" r="38" stroke="#D97706" strokeWidth="2.5" strokeDasharray="4 2" fill="#FEF3C7" fillOpacity="0.3" />
      {/* Central Shield */}
      <path
        d="M50 24 L68 32 C68 54, 50 68, 50 72 C50 68, 32 54, 32 32 Z"
        fill="#0F172A"
        stroke="#D97706"
        strokeWidth="2"
      />
      {/* Crossed Kukris in Shield */}
      <path
        d="M40 37 C42 42, 54 53, 58 55 M60 37 C58 42, 46 53, 42 55"
        stroke="#F8FAFC"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Central Star / Spark */}
      <circle cx="50" cy="46" r="3.5" fill="#F59E0B" />
      {/* Top Ashoka Capital Mini */}
      <path
        d="M45 13 C45 10, 55 10, 55 13 L53 19 L47 19 Z"
        fill="#D97706"
      />
      {/* SSB Banner */}
      <path
        d="M18 84 L50 80 L82 84 L78 96 L50 92 L22 96 Z"
        fill="#0F172A"
        stroke="#D97706"
        strokeWidth="1.2"
      />
      <text
        x="50"
        y="90"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="bold"
        fill="#F8FAFC"
        fontFamily="sans-serif"
        letterSpacing="0.8"
      >
        SSB
      </text>
      {/* Motto: Seva Suraksha Bandhutva */}
      <text
        x="50"
        y="105"
        textAnchor="middle"
        fontSize="5"
        fontWeight="600"
        fill="#475569"
        fontFamily="sans-serif"
      >
        SEVA · SURAKSHA · BANDHUTVA
      </text>
    </svg>
  );
}

export function TricolorBar({ className = "" }: { className?: string }) {
  return (
    <div className={`h-[3px] w-full flex rounded-full overflow-hidden ${className}`}>
      <span className="flex-1 bg-[#FF9933]" />
      <span className="flex-1 bg-white border-y border-stone-200" />
      <span className="flex-1 bg-[#138808]" />
    </div>
  );
}
