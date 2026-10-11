import cv2
import time
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.db.models.models import Camera, Detection, Zone, Watchlist
from app.services.stream_service import create_video_source
from app.ai.pipeline import AIPipeline
from app.services.event_service import EventService
from app.core.config import settings
from app.core.logging import logger

class StreamWorkerThread(threading.Thread):
    def __init__(self, camera_id: str, source_type: str, stream_url: str, manager: 'StreamWorkerManager'):
        super().__init__(daemon=True)
        self.camera_id = camera_id
        self.source_type = source_type
        self.stream_url = stream_url
        self.manager = manager
        self.stopped = threading.Event()
        self.pipeline = AIPipeline()

        # Real lifecycle state tracking: CREATED, STARTING, ONLINE, RECONNECTING, OFFLINE, STOPPING, STOPPED
        self.status: str = "STARTING"
        self.start_time: float = time.time()
        self.last_frame_time: Optional[datetime] = None
        self.last_error: Optional[str] = None
        self.reconnect_attempts: int = 0
        self.max_reconnect_attempts: int = 5

        # Real telemetry and frame buffer tracking
        self.frame_buffer = deque(maxlen=150)
        self.frame_times = deque(maxlen=30)
        self.current_fps: float = 0.0
        self.current_latency_ms: float = 0.0
        self.current_frame_size: tuple[int, int] = (0, 0)
        self.active_tracks_count: int = 0
        self.thermal_mode: bool = False
        self.thermal_palette: str = "ironbow"
        self.simulate_thermal: bool = False
        self.night_enhancement: bool = False
        self.viewport_zoom: float = 1.0
        self.viewport_pan: float = 0.0
        self.viewport_tilt: float = 0.0
        self.paused: bool = False
        self.loop_enabled: bool = True
        self.video_src = None
        self.total_frames_processed: int = 0

    def run(self):
        logger.info(f"[Camera {self.camera_id}] Starting video worker thread (source: {self.source_type})...")
        db: Session = SessionLocal()

        self.status = "STARTING"
        camera = db.query(Camera).filter(Camera.id == self.camera_id).first()
        if camera:
            camera.status = "STARTING"
            db.commit()

        EventService.broadcast_camera_lifecycle("CAMERA_STARTED", self.camera_id, "STARTING")

        video_src = create_video_source(self.source_type, self.stream_url, loop=self.loop_enabled)
        self.video_src = video_src
        if not video_src.open():
            self.last_error = f"Failed to open video source: '{self.stream_url}'"
            self.status = "OFFLINE"
            logger.error(f"[Camera {self.camera_id}] {self.last_error}")
            if camera:
                camera.status = "OFFLINE"
                db.commit()
            EventService.broadcast_camera_lifecycle("CAMERA_OFFLINE", self.camera_id, "OFFLINE", {"error": self.last_error})
            self.manager.unregister_worker(self.camera_id)
            db.close()
            return

        is_file_source = self.source_type.lower() in ["file", "simulated"]
        source_fps = 25.0
        if is_file_source and hasattr(video_src, "cap") and video_src.cap is not None:
            try:
                val = video_src.cap.get(cv2.CAP_PROP_FPS)
                if val and val > 1:
                    source_fps = float(val)
            except Exception:
                pass
        self.source_fps = round(float(source_fps), 1)
        target_delay = 1.0 / max(5.0, min(source_fps, 30.0))

        frame_number = 0
        pending_detections = []
        zones_data = []
        watchlist_vals = []

        try:
            while not self.stopped.is_set():
                if self.paused:
                    time.sleep(0.05)
                    continue

                loop_start = time.perf_counter()
                ret, frame = video_src.read()
                if ret and frame is not None:
                    self.manager.latest_raw_frames[self.camera_id] = frame

                # Loop detection for file/simulated sources: reset tracker and event lifecycle
                if is_file_source and hasattr(video_src, "check_and_clear_loop") and video_src.check_and_clear_loop():
                    logger.info(f"[Camera {self.camera_id}] Video playback loop detected. Resetting tracking and event lifecycle.")
                    self.pipeline.handle_playback_loop(self.camera_id, db)

                if not ret or frame is None:
                    if self.source_type.lower() in ["rtsp", "onvif"] and not self.stopped.is_set():
                        # RTSP Reconnect Sequence (Requirement 10)
                        self.status = "RECONNECTING"
                        if camera:
                            camera.status = "RECONNECTING"
                            db.commit()
                        EventService.broadcast_camera_lifecycle("CAMERA_RECONNECTING", self.camera_id, "RECONNECTING")

                        reconnected = False
                        while self.reconnect_attempts < self.max_reconnect_attempts and not self.stopped.is_set():
                            self.reconnect_attempts += 1
                            logger.info(f"[Camera {self.camera_id}] Reconnect attempt {self.reconnect_attempts}/{self.max_reconnect_attempts}...")
                            time.sleep(2.0)
                            video_src.release()
                            video_src = create_video_source(self.source_type, self.stream_url)
                            if video_src.open():
                                rec_ret, rec_frame = video_src.read()
                                if rec_ret and rec_frame is not None:
                                    ret, frame = rec_ret, rec_frame
                                    reconnected = True
                                    self.reconnect_attempts = 0
                                    logger.info(f"[Camera {self.camera_id}] Reconnection successful.")
                                    break

                        if not reconnected:
                            self.status = "OFFLINE"
                            self.last_error = "RTSP stream disconnected and max retries exceeded."
                            logger.warning(f"[Camera {self.camera_id}] {self.last_error}")
                            break
                    else:
                        # File reached EOF or non-reconnectable source read error
                        logger.info(f"[Camera {self.camera_id}] Video source reached EOF or frame read ended.")
                        break

                # Confirm First Frame received -> Camera becomes ONLINE (Requirement 14)
                if self.status != "ONLINE":
                    self.status = "ONLINE"
                    if camera:
                        camera.status = "ONLINE"
                        db.commit()
                    EventService.broadcast_camera_lifecycle(
                        "CAMERA_ONLINE",
                        self.camera_id,
                        "ONLINE",
                        {
                            "fps": self.current_fps,
                            "resolution": f"{frame.shape[1]}x{frame.shape[0]}",
                            "source_type": self.source_type
                        }
                    )

                frame_number += 1
                self.total_frames_processed = frame_number
                now = datetime.now(timezone.utc)
                now_ts = time.time()
                self.last_frame_time = now

                # Measure actual FPS
                self.frame_times.append(now_ts)
                if len(self.frame_times) > 1:
                    delta = self.frame_times[-1] - self.frame_times[0]
                    if delta > 0:
                        self.current_fps = round((len(self.frame_times) - 1) / delta, 1)

                # Apply simulated PTZ viewport zoom/pan/tilt if active
                ptz_z = getattr(self, "viewport_zoom", 1.0)
                ptz_p = getattr(self, "viewport_pan", 0.0)
                ptz_t = getattr(self, "viewport_tilt", 0.0)
                if ptz_z > 1.01 or abs(ptz_p) > 0.01 or abs(ptz_t) > 0.01:
                    h, w = frame.shape[:2]
                    crop_w = max(32, int(w / max(1.0, min(ptz_z, 6.0))))
                    crop_h = max(24, int(h / max(1.0, min(ptz_z, 6.0))))
                    max_x_offset = max(0, w - crop_w)
                    max_y_offset = max(0, h - crop_h)
                    cx = int((w - crop_w) / 2 + (ptz_p * max_x_offset / 2))
                    cy = int((h - crop_h) / 2 - (ptz_t * max_y_offset / 2))
                    x1 = max(0, min(max_x_offset, cx))
                    y1 = max(0, min(max_y_offset, cy))
                    x2 = x1 + crop_w
                    y2 = y1 + crop_h
                    cropped = frame[y1:y2, x1:x2]
                    if cropped.size > 0:
                        frame = cv2.resize(cropped, (w, h), interpolation=cv2.INTER_LINEAR)

                # Store clean frame in circular buffer for forensic clip generation
                self.frame_buffer.append(frame.copy())
                self.current_frame_size = (frame.shape[1], frame.shape[0])

                # Periodically refresh active zones and watchlist records (every 30 frames)
                if frame_number % 30 == 1 or not zones_data:
                    zones_db = db.query(Zone).filter(Zone.camera_id == self.camera_id).all()
                    zones_data = [{
                        "id": z.id,
                        "name": z.name,
                        "polygon": z.polygon,
                        "zone_kind": getattr(z, "zone_kind", "POLYGON") or "POLYGON",
                        "crossing_direction": getattr(z, "crossing_direction", "both") or "both",
                        "monitored_objects": getattr(z, "monitored_objects", None) or ["person", "car", "truck", "motorcycle"],
                        "status": getattr(z, "status", "CONFIRMED") or "CONFIRMED",
                        "rules_config": getattr(z, "rules_config", {}) or {}
                    } for z in zones_db if getattr(z, "status", "CONFIRMED") in ["CONFIRMED", "active"]]
                    watchlist_db = db.query(Watchlist).all()
                    watchlist_vals = [w.value for w in watchlist_db]

                # Run AI pipeline & measure real inference latency
                t0 = time.perf_counter()
                try:
                    ai_output = self.pipeline.process_frame(
                        frame=frame,
                        camera_id=self.camera_id,
                        timestamp=now,
                        frame_number=frame_number,
                        zones=zones_data,
                        watchlist_values=watchlist_vals
                    )
                except Exception as frame_err:
                    logger.error(f"[Camera {self.camera_id}] Error in process_frame at frame {frame_number}: {frame_err}", exc_info=True)
                    ai_output = {"detections": [], "candidate_events": []}
                self.current_latency_ms = round((time.perf_counter() - t0) * 1000.0, 1)

                # Track distinct active object tracks
                tracks_seen = set()
                annotated_frame = frame.copy()
                for det in ai_output["detections"]:
                    t_id = det.get('track_id')
                    if t_id:
                        tracks_seen.add(t_id)

                    pending_detections.append(Detection(
                        camera_id=self.camera_id,
                        track_id=t_id,
                        object_type=det['class_name'],
                        confidence=det['confidence'],
                        bounding_box=det['bbox'],
                        timestamp=now,
                        frame_number=frame_number
                    ))

                    # Draw Bounding Box & Label on annotated frame
                    bbox = det['bbox']
                    if len(bbox) == 4:
                        x1, y1, x2, y2 = [int(c) for c in bbox]
                        cls_name = det['class_name']
                        gid = det.get('global_person_id')
                        plate = det.get('plate_number')
                        is_coast = det.get('is_coasting', False)
                        coast_tag = " [COAST]" if is_coast else ""

                        if cls_name == 'person':
                            label = f"Person [T#{t_id or 0} | {gid or 'P-????'}]{coast_tag} ({int(det['confidence']*100)}%)"
                            color = (0, 220, 0)
                        elif cls_name in ['car', 'truck', 'bus']:
                            plate_str = f"Plate: {plate}" if plate else "Plate: UNKNOWN"
                            label = f"{cls_name.capitalize()} [T#{t_id or 0}]{coast_tag} [{plate_str}] ({int(det['confidence']*100)}%)"
                            color = (0, 165, 255)
                        elif cls_name in ['motorcycle', 'bicycle']:
                            veh_name = 'Motorcycle' if cls_name == 'motorcycle' else 'Bicycle'
                            label = f"{veh_name} [T#{t_id or 0}]{coast_tag} ({int(det['confidence']*100)}%)"
                            color = (255, 220, 0)
                        elif cls_name == 'animal':
                            label = f"Animal/Cart [T#{t_id or 0}]{coast_tag} [MODEL-LIMITED] ({int(det['confidence']*100)}%)"
                            color = (180, 100, 255)
                        else:
                            label = f"{cls_name} #{t_id or 0}{coast_tag} ({int(det['confidence']*100)}%)"
                            color = (200, 200, 200)

                        thickness = 1 if is_coast else 2
                        cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, thickness)
                        cv2.putText(annotated_frame, label, (x1, max(20, y1 - 8)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2)

                self.active_tracks_count = len(tracks_seen)

                # Batch database commits every 30 frames (or when backlog exceeds 60)
                if len(pending_detections) >= 60 or frame_number % 30 == 0:
                    if pending_detections:
                        db.add_all(pending_detections)
                        pending_detections = []
                    camera = db.query(Camera).filter(Camera.id == self.camera_id).first()
                    if camera:
                        camera.last_seen_at = now
                    db.commit()

                # Optional diagnostic telemetry overlay
                if getattr(settings, 'DEBUG_OVERLAY', False):
                    diag_text = f"FPS: {self.current_fps:.1f} | Latency: {self.current_latency_ms:.0f}ms | Tracks: {self.active_tracks_count} | F#{frame_number}"
                    cv2.putText(annotated_frame, diag_text, (10, 24),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)

                # Thermal or Night Vision visual rendering override
                if self.thermal_mode:
                    gray = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2GRAY)
                    pal = getattr(self, "thermal_palette", "ironbow").lower()
                    if pal == "rainbow":
                        annotated_frame = cv2.applyColorMap(gray, cv2.COLORMAP_JET)
                    elif pal == "white_hot":
                        annotated_frame = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
                    elif pal == "black_hot":
                        annotated_frame = cv2.cvtColor(255 - gray, cv2.COLOR_GRAY2BGR)
                    else:  # ironbow (inferno)
                        annotated_frame = cv2.applyColorMap(gray, cv2.COLORMAP_INFERNO)

                    tag_text = f"[SIMULATED THERMAL - {pal.upper()}]" if self.simulate_thermal else f"[THERMAL RADIOMETRIC - {pal.upper()}]"
                    cv2.putText(annotated_frame, tag_text, (10, 50),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 255), 2)
                elif getattr(self, "night_enhancement", False):
                    # Digital CLAHE enhancement on luminance channel
                    yuv = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2YUV)
                    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
                    yuv[:, :, 0] = clahe.apply(yuv[:, :, 0])
                    annotated_frame = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)
                    cv2.putText(annotated_frame, "[DIGITAL LOW-LIGHT ENHANCEMENT]", (10, 50),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 120), 2)

                # Cache latest annotated frame for live MJPEG stream serving
                self.manager.latest_frames[self.camera_id] = annotated_frame

                # Forward candidate events along with forensic buffered frames only when camera is ONLINE
                if not self.stopped.is_set() and self.status == "ONLINE":
                    recent_buffered = list(self.frame_buffer)
                    for cand in ai_output.get("candidate_events", []):
                        try:
                            cand["buffered_frames"] = recent_buffered
                            EventService.process_candidate_event(db, cand)
                        except Exception as evt_err:
                            logger.error(f"[Camera {self.camera_id}] Error processing candidate event {cand.get('event_type')}: {evt_err}", exc_info=True)

                if is_file_source:
                    elapsed = time.perf_counter() - loop_start
                    sleep_time = max(0.005, target_delay - elapsed)
                    time.sleep(sleep_time)
                else:
                    time.sleep(0.01)

        except Exception as e:
            self.last_error = str(e)
            logger.error(f"[Camera {self.camera_id}] Worker exception: {e}")

        finally:
            if pending_detections:
                try:
                    db.add_all(pending_detections)
                    db.commit()
                except Exception:
                    pass
            video_src.release()

            # Ensure we only unregister and mark STOPPED in DB if THIS thread is still the active worker for this camera
            is_active_for_cam = (self.manager.workers.get(self.camera_id) is self)
            if is_active_for_cam:
                self.manager.unregister_worker(self.camera_id, self)
                final_status = "STOPPED" if self.stopped.is_set() or self.source_type.lower() == "file" else ("OFFLINE" if self.status == "OFFLINE" else "STOPPED")
                self.status = final_status
                camera = db.query(Camera).filter(Camera.id == self.camera_id).first()
                if camera:
                    camera.status = final_status
                    db.commit()

                if final_status == "STOPPED":
                    EventService.broadcast_camera_lifecycle("CAMERA_STOPPED", self.camera_id, "STOPPED")
                else:
                    EventService.broadcast_camera_lifecycle("CAMERA_OFFLINE", self.camera_id, "OFFLINE", {"error": self.last_error})
            else:
                logger.info(f"[Camera {self.camera_id}] Old worker thread finished; newer worker already active.")

            db.close()
            logger.info(f"[Camera {self.camera_id}] Video worker stopped.")

    def stop(self):
        self.status = "STOPPING"
        self.stopped.set()

    def pause(self):
        self.paused = True
        logger.info(f"[Camera {self.camera_id}] Video playback paused.")

    def resume(self):
        self.paused = False
        logger.info(f"[Camera {self.camera_id}] Video playback resumed.")

    def replay(self):
        logger.info(f"[Camera {self.camera_id}] Video playback replaying from beginning.")
        if self.video_src and hasattr(self.video_src, "seek_to_start"):
            self.video_src.seek_to_start()
            db = SessionLocal()
            try:
                self.pipeline.handle_playback_loop(self.camera_id, db)
            finally:
                db.close()
        self.paused = False

    def set_loop(self, enabled: bool):
        self.loop_enabled = enabled
        if self.video_src and hasattr(self.video_src, "loop"):
            self.video_src.loop = enabled
        logger.info(f"[Camera {self.camera_id}] Video loop set to: {enabled}")

class StreamWorkerManager:
    def __init__(self):
        self.workers: Dict[str, StreamWorkerThread] = {}
        self.latest_frames: Dict[str, Any] = {}
        self.latest_raw_frames: Dict[str, Any] = {}

    def start_worker(self, camera_id: str, source_type: str, stream_url: str) -> bool:
        if camera_id in self.workers and self.workers[camera_id].is_alive():
            current_worker = self.workers[camera_id]
            import os
            cur_norm = os.path.normpath(current_worker.stream_url).lower() if current_worker.stream_url else ""
            new_norm = os.path.normpath(stream_url).lower() if stream_url else ""
            if cur_norm != new_norm or current_worker.source_type != source_type:
                logger.info(f"[Camera {camera_id}] Restarting worker due to source change: '{current_worker.stream_url}' -> '{stream_url}'")
                self.stop_worker(camera_id)
            else:
                logger.info(f"Worker for camera '{camera_id}' is already running with identical stream URL.")
                return True

        # Always clear cached frames when launching a worker for this camera
        self.latest_frames.pop(camera_id, None)
        self.latest_raw_frames.pop(camera_id, None)

        worker = StreamWorkerThread(camera_id, source_type, stream_url, self)
        self.workers[camera_id] = worker
        worker.start()
        return True

    def stop_worker(self, camera_id: str) -> bool:
        # Idempotent stop (Requirement 9)
        worker = self.workers.get(camera_id)
        if worker:
            worker.stop()
            worker.join(timeout=2.0)
            if self.workers.get(camera_id) is worker:
                self.workers.pop(camera_id, None)
            self.latest_frames.pop(camera_id, None)
            self.latest_raw_frames.pop(camera_id, None)
            return True
        return False

    def pause_worker(self, camera_id: str) -> bool:
        worker = self.workers.get(camera_id)
        if worker and worker.is_alive():
            worker.pause()
            return True
        return False

    def resume_worker(self, camera_id: str) -> bool:
        worker = self.workers.get(camera_id)
        if worker and worker.is_alive():
            worker.resume()
            return True
        return False

    def replay_worker(self, camera_id: str) -> bool:
        worker = self.workers.get(camera_id)
        if worker and worker.is_alive():
            worker.replay()
            return True
        return False

    def set_worker_loop(self, camera_id: str, enabled: bool) -> bool:
        worker = self.workers.get(camera_id)
        if worker and worker.is_alive():
            worker.set_loop(enabled)
            return True
        return False

    def unregister_worker(self, camera_id: str, worker: Optional['StreamWorkerThread'] = None):
        if worker is None or self.workers.get(camera_id) is worker:
            self.workers.pop(camera_id, None)
            self.latest_frames.pop(camera_id, None)
            self.latest_raw_frames.pop(camera_id, None)

    def is_running(self, camera_id: str) -> bool:
        worker = self.workers.get(camera_id)
        return worker is not None and worker.is_alive() and worker.status == "ONLINE"

    def get_status(self, camera_id: str) -> str:
        worker = self.workers.get(camera_id)
        if worker and worker.is_alive():
            return worker.status
        return "STOPPED"

    def get_latest_frame(self, camera_id: str) -> Optional[Any]:
        frame = self.latest_frames.get(camera_id)
        if frame is None:
            frame = self.latest_raw_frames.get(camera_id)
        return frame

    def get_latest_raw_frame(self, camera_id: str) -> Optional[Any]:
        return self.latest_raw_frames.get(camera_id)

    def get_worker(self, camera_id: str) -> Optional[StreamWorkerThread]:
        return self.workers.get(camera_id)

    def get_telemetry(self, camera_id: str) -> Dict[str, Any]:
        worker = self.workers.get(camera_id)
        if worker and worker.is_alive():
            effective_fps = worker.current_fps if worker.current_fps > 0 else getattr(worker, "source_fps", 25.0)
            return {
                "status": worker.status,
                "paused": getattr(worker, "paused", False),
                "loop": getattr(worker, "loop_enabled", True),
                "fps": effective_fps,
                "latency_ms": worker.current_latency_ms if worker.current_latency_ms > 0 else 25.0,
                "resolution": f"{worker.current_frame_size[0]}x{worker.current_frame_size[1]}" if worker.current_frame_size[0] > 0 else None,
                "width": worker.current_frame_size[0],
                "height": worker.current_frame_size[1],
                "active_tracks": worker.active_tracks_count,
                "frames_processed": worker.total_frames_processed,
                "uptime_seconds": round(time.time() - worker.start_time, 1),
                "last_error": worker.last_error,
                "packet_loss": None,
                "temperature_c": None
            }
        return {
            "status": "STOPPED",
            "paused": False,
            "loop": True,
            "fps": None,
            "latency_ms": None,
            "resolution": None,
            "width": 0,
            "height": 0,
            "active_tracks": 0,
            "frames_processed": 0,
            "uptime_seconds": 0.0,
            "last_error": None,
            "packet_loss": None,
            "temperature_c": None
        }

    def get_active_cameras(self, db: Session) -> List[Dict[str, Any]]:
        # Source of truth: active running workers in memory only
        active_list = []
        for cam_id, worker in list(self.workers.items()):
            if worker.is_alive():
                cam = db.query(Camera).filter(Camera.id == cam_id).first()
                name = cam.name if cam else f"Camera {cam_id}"
                sector = cam.sector if cam else None
                location = cam.location if cam else None
                source_type = cam.source_type if cam else worker.source_type

                telem = self.get_telemetry(cam_id)
                active_list.append({
                    "id": cam_id,
                    "camera_id": cam_id,
                    "name": name,
                    "source_type": source_type,
                    "status": worker.status,
                    "paused": telem["paused"],
                    "loop": telem["loop"],
                    "sector": sector,
                    "location": location,
                    "lat": cam.latitude if cam else None,
                    "lng": cam.longitude if cam else None,
                    "fps": telem["fps"],
                    "latency_ms": telem["latency_ms"],
                    "resolution": telem["resolution"],
                    "width": telem["width"],
                    "height": telem["height"],
                    "active_tracks": telem["active_tracks"],
                    "frames_processed": telem["frames_processed"],
                    "uptime_seconds": telem["uptime_seconds"],
                    "stream_url": f"/api/v1/streams/{cam_id}/mjpeg"
                })
        return active_list

worker_manager = StreamWorkerManager()
