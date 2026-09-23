import { Camera } from "../types";

export default function CameraGrid({ cameras }: { cameras: Camera[] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {cameras.map((cam) => (
        <div
          key={cam.id}
          className="relative aspect-video rounded-xl bg-navy-950 overflow-hidden flex items-center justify-center border border-navy-300"
        >
          <span className="text-navy-400 text-xs font-mono">{cam.name}</span>

          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-lg px-2.5 py-1">
            <span
              className={`w-2 h-2 rounded-full ${
                cam.status === "ACTIVE"
                  ? "bg-status-live animate-cctv-pulse"
                  : cam.status === "ALERT"
                  ? "bg-status-critical animate-cctv-pulse"
                  : "bg-navy-500"
              }`}
            />
            <span className="text-xs font-mono text-white">{cam.code}</span>
          </div>

          <div className="absolute bottom-3 left-3 text-[11px] font-mono text-navy-300 bg-black/50 px-1.5 py-0.5 rounded">
            {cam.sector}
          </div>
        </div>
      ))}
    </div>
  );
}
