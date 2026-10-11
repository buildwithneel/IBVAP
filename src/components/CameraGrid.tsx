import { Camera } from "../types";
import { api } from "../services/api";

export default function CameraGrid({ cameras }: { cameras: Camera[] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {cameras.map((cam) => {
        const isLive = cam.status === "ACTIVE" || cam.status === "ALERT";
        const isSim = Boolean(
          cam.isSimulated ||
          cam.sourceType === "file" ||
          cam.sourceType === "simulated" ||
          cam.name?.includes("TEST STREAM")
        );

        return (
          <div
            key={cam.id}
            className="relative aspect-video rounded-xl bg-navy-950 overflow-hidden flex items-center justify-center border border-navy-300"
          >
            {isLive ? (
              isSim && cam.videoUrl ? (
                <video
                  src={cam.videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover z-0 opacity-80"
                />
              ) : (
                <img
                  src={api.getMjpegStreamUrl(cam.id)}
                  alt={cam.name}
                  className="absolute inset-0 w-full h-full object-cover z-0 opacity-80"
                />
              )
            ) : (
              <span className="text-navy-400 text-xs font-mono">{cam.name} (Offline)</span>
            )}

            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-lg px-2.5 py-1 z-10">
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

            <div className="absolute bottom-3 left-3 text-[11px] font-mono text-navy-300 bg-black/50 px-1.5 py-0.5 rounded z-10">
              {cam.sector}
            </div>
          </div>
        );
      })}
    </div>
  );
}
