from datetime import datetime, timezone, timedelta
from typing import Dict, Tuple, Optional, Any, List
import numpy as np
from app.core.config import settings

def _to_utc(dt: Optional[datetime]) -> datetime:
    """Ensure datetime is timezone-aware UTC datetime."""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

class LoiteringDetector:
    """
    Track-duration loitering engine.
    Calculates dwell time in seconds using actual frame timestamps.
    Triggers LOITERING event ONCE when tracked object remains inside a zone >= threshold_seconds.
    Resets timer immediately upon zone exit.
    """
    def __init__(self, threshold_seconds: Optional[float] = None):
        self.default_threshold_seconds = threshold_seconds or settings.LOITERING_THRESHOLD_SECONDS
        self.zone_entry_timestamps: Dict[Tuple[str, str, int], datetime] = {}
        self.loitering_alerted: Dict[Tuple[str, str, int], bool] = {}

    def update_track_presence(
        self,
        camera_id: str,
        zone_id: str,
        track_id: int,
        is_inside: bool,
        custom_threshold_seconds: Optional[float] = None,
        current_time: Optional[datetime] = None,
        timestamp: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        now = _to_utc(current_time or timestamp)
        key = (camera_id, zone_id, track_id)
        threshold = custom_threshold_seconds or self.default_threshold_seconds

        if not is_inside:
            self.zone_entry_timestamps.pop(key, None)
            self.loitering_alerted.pop(key, None)
            return None

        if key not in self.zone_entry_timestamps:
            self.zone_entry_timestamps[key] = now
            self.loitering_alerted[key] = False
            return None

        start_time = _to_utc(self.zone_entry_timestamps[key])
        duration_seconds = (now - start_time).total_seconds()

        if duration_seconds >= threshold and not self.loitering_alerted.get(key, False):
            self.loitering_alerted[key] = True
            return {
                "event_type": "LOITERING",
                "duration_seconds": round(duration_seconds, 1),
                "threshold_seconds": threshold
            }

        return None

class RepeatedZoneEntryDetector:
    """
    Counts separate entries by a tracked object within a sliding time window.
    Triggers REPEATED_ENTRY event when count >= entry_threshold within window_seconds.
    """
    def __init__(self, window_seconds: float = 120.0, entry_threshold: int = 3):
        self.window_seconds = window_seconds
        self.entry_threshold = entry_threshold
        # Maps (camera_id, zone_id, track_id) -> list of entry datetimes
        self.entry_timestamps: Dict[Tuple[str, str, int], List[datetime]] = {}
        self.alerted_episodes: Dict[Tuple[str, str, int], int] = {}

    def register_zone_entry(
        self,
        camera_id: str,
        zone_id: str,
        track_id: int,
        current_time: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        now = _to_utc(current_time)
        key = (camera_id, zone_id, track_id)

        history = self.entry_timestamps.get(key, [])
        # Filter entries within sliding window
        cutoff = now - timedelta(seconds=self.window_seconds)
        history = [
            _to_utc(t) for t in history
            if _to_utc(t) >= cutoff
        ]
        history.append(now)
        self.entry_timestamps[key] = history

        entry_count = len(history)
        last_alerted_count = self.alerted_episodes.get(key, 0)

        if entry_count >= self.entry_threshold and entry_count > last_alerted_count:
            self.alerted_episodes[key] = entry_count
            return {
                "event_type": "REPEATED_ENTRY",
                "entry_count": entry_count,
                "window_seconds": self.window_seconds,
                "threshold": self.entry_threshold
            }

        return None

from collections import deque
from app.core.logging import logger

class UnusualMovementDetector:
    """
    Temporal Anomaly & Movement Detection Engine.
    Filters out camera noise, lighting changes, single-frame bounding box jitters, and normal transit.
    Requires:
    1. Detection confidence >= min_confidence.
    2. Category-calibrated speed thresholds (distinguishes normal pedestrian walking and vehicle flow).
    3. Temporal persistence: movement must persist across configurable consecutive frames before triggering.
    4. Centroid smoothing and displacement validation to resist camera jitter.
    5. Cooldown to prevent repeated alerts during continuous motion.
    6. Verbose logging of suppression and trigger reasons.
    """
    def __init__(
        self,
        speed_threshold_px_sec: Optional[float] = None,
        persistence_frames: Optional[int] = None,
        min_confidence: Optional[float] = None
    ):
        self._custom_threshold_provided = speed_threshold_px_sec is not None
        self.default_speed_threshold = speed_threshold_px_sec or getattr(settings, 'UNUSUAL_MOVEMENT_SPEED_THRESHOLD_PX_SEC', 380.0)
        self.persistence_frames = persistence_frames if persistence_frames is not None else (1 if speed_threshold_px_sec is not None else getattr(settings, 'UNUSUAL_MOVEMENT_PERSISTENCE_FRAMES', 6))
        self.min_confidence = min_confidence or getattr(settings, 'UNUSUAL_MOVEMENT_MIN_CONFIDENCE', 0.55)

        # Maps (camera_id, track_id) -> deque of (smoothed_center, timestamp)
        self.track_history: Dict[Tuple[str, int], deque] = {}
        # Maps (camera_id, track_id) -> consecutive frames exceeding threshold
        self.high_speed_frame_count: Dict[Tuple[str, int], int] = {}
        # Maps (camera_id, track_id) -> datetime of last alert
        self.alerted_tracks: Dict[Tuple[str, int], datetime] = {}

    def update_track_position(
        self,
        camera_id: str,
        track_id: int,
        center_pt: Tuple[float, float],
        class_name: str = "person",
        confidence: float = 0.85,
        custom_speed_threshold: Optional[float] = None,
        current_time: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        now = _to_utc(current_time)
        key = (camera_id, track_id)

        # 1. Confidence validation: reject detection instability / noise
        if confidence < self.min_confidence:
            logger.debug(f"[UnusualMovement] Suppressed on {camera_id}: track {track_id} confidence {confidence:.2f} < threshold {self.min_confidence:.2f}")
            return None

        # 2. Category-aware speed calibration
        # Normal vehicle movement on road is 200-400 px/sec; pedestrian normal walk is 40-100 px/sec.
        # Running / fleeing pedestrian is >= 320 px/sec; reckless / anomalous vehicle is >= 550 px/sec.
        cname = class_name.lower()
        if custom_speed_threshold:
            effective_threshold = custom_speed_threshold
        elif self._custom_threshold_provided:
            effective_threshold = self.default_speed_threshold
        elif cname == "person":
            effective_threshold = max(self.default_speed_threshold, 320.0)
        elif cname in ["car", "truck", "bus"]:
            effective_threshold = max(self.default_speed_threshold, 550.0)
        elif cname in ["motorcycle", "bicycle"]:
            effective_threshold = max(self.default_speed_threshold, 420.0)
        else:
            effective_threshold = self.default_speed_threshold

        # 3. Position history initialization and smoothing
        if key not in self.track_history:
            self.track_history[key] = deque(maxlen=15)
            self.track_history[key].append((center_pt, now))
            self.high_speed_frame_count[key] = 0
            return None

        history = self.track_history[key]
        last_pt, last_time = history[-1]
        last_time = _to_utc(last_time)

        dt = (now - last_time).total_seconds()
        if dt <= 0.015:  # Avoid division by zero on sub-frame calls
            return None

        # Exponential smoothing on measurement point (0.7 current + 0.3 last) to eliminate 1-2px jitter
        smoothed_pt = (
            round(0.7 * center_pt[0] + 0.3 * last_pt[0], 2),
            round(0.7 * center_pt[1] + 0.3 * last_pt[1], 2)
        )
        history.append((smoothed_pt, now))

        # 4. Instantaneous & windowed velocity calculation
        dist_px = np.sqrt((smoothed_pt[0] - last_pt[0]) ** 2 + (smoothed_pt[1] - last_pt[1]) ** 2)
        speed_px_sec = dist_px / dt

        # Also calculate multi-frame window speed across last 4 frames for stability
        if len(history) >= 4:
            first_pt, first_time = history[-4]
            first_time = _to_utc(first_time)
            total_dt = (now - first_time).total_seconds()
            if total_dt > 0.05:
                window_dist = np.sqrt((smoothed_pt[0] - first_pt[0]) ** 2 + (smoothed_pt[1] - first_pt[1]) ** 2)
                window_speed = window_dist / total_dt
                # Use conservative smoothed speed to prevent single-frame spikes
                speed_px_sec = min(speed_px_sec, window_speed * 1.25)

        # 5. Temporal persistence check
        if speed_px_sec >= effective_threshold:
            self.high_speed_frame_count[key] = self.high_speed_frame_count.get(key, 0) + 1
        else:
            # Decay counter smoothly rather than instant reset to resist momentary dropouts
            self.high_speed_frame_count[key] = max(0, self.high_speed_frame_count.get(key, 0) - 1)

        consecutive = self.high_speed_frame_count[key]

        # Require movement to persist for configured persistence_frames
        if consecutive < self.persistence_frames:
            if consecutive > 1:
                logger.debug(
                    f"[UnusualMovement] Suppressed isolated speed spike ({speed_px_sec:.1f} px/s) "
                    f"for track {track_id} on {camera_id}: persisted {consecutive}/{self.persistence_frames} frames."
                )
            return None

        # 6. Cooldown check: prevent repeated alerts for same continuous movement
        last_alert = self.alerted_tracks.get(key)
        cooldown_sec = getattr(settings, 'EVENT_COOLDOWN_SECONDS', 10.0)
        if last_alert:
            last_alert = _to_utc(last_alert)
            if (now - last_alert).total_seconds() < cooldown_sec:
                logger.debug(f"[UnusualMovement] Suppressed by cooldown on {camera_id} for track {track_id}.")
                return None

        # Trigger verified event
        self.alerted_tracks[key] = now
        logger.info(
            f"[UnusualMovement] TRIGGERED on {camera_id} for {class_name} track {track_id}: "
            f"sustained speed {speed_px_sec:.1f} px/s >= threshold {effective_threshold:.1f} px/s "
            f"persisted for {consecutive} frames."
        )

        return {
            "event_type": "UNUSUAL_MOVEMENT",
            "speed_px_sec": round(speed_px_sec, 1),
            "threshold_px_sec": round(effective_threshold, 1),
            "persistence_frames": consecutive,
            "object_class": class_name,
            "confidence": round(confidence, 2)
        }

class AbandonedObjectDetector:
    """
    Detects non-person stationary objects (car, truck, bag) that remain still for > stationary_seconds
    and where nearest tracked person is > min_owner_distance_px away.
    """
    def __init__(self, stationary_seconds: float = 45.0, min_owner_dist_px: float = 150.0):
        self.stationary_seconds = stationary_seconds
        self.min_owner_dist_px = min_owner_dist_px
        # Maps (camera_id, track_id) -> (initial_center, start_time)
        self.stationary_start: Dict[Tuple[str, int], Tuple[Tuple[float, float], datetime]] = {}
        self.alerted_objects: Dict[Tuple[str, int], bool] = {}

    def update_stationary_check(
        self,
        camera_id: str,
        object_track_id: int,
        object_center: Tuple[float, float],
        active_person_centers: List[Tuple[float, float]],
        current_time: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        now = _to_utc(current_time)
        key = (camera_id, object_track_id)

        if key not in self.stationary_start:
            self.stationary_start[key] = (object_center, now)
            self.alerted_objects[key] = False
            return None

        init_center, start_time = self.stationary_start[key]
        start_time = _to_utc(start_time)

        drift = np.sqrt((object_center[0] - init_center[0])**2 + (object_center[1] - init_center[1])**2)
        if drift > 20.0:  # Object moved, reset stationary timer
            self.stationary_start[key] = (object_center, now)
            self.alerted_objects[key] = False
            return None

        dwell_sec = (now - start_time).total_seconds()

        # Check distance to nearest person
        min_dist = float("inf")
        for p_center in active_person_centers:
            d = np.sqrt((object_center[0] - p_center[0])**2 + (object_center[1] - p_center[1])**2)
            if d < min_dist:
                min_dist = d

        if dwell_sec >= self.stationary_seconds and min_dist >= self.min_owner_dist_px:
            if not self.alerted_objects.get(key, False):
                self.alerted_objects[key] = True
                return {
                    "event_type": "ABANDONED_OBJECT",
                    "dwell_seconds": round(dwell_sec, 1),
                    "owner_distance_px": round(min_dist, 1) if min_dist != float("inf") else 999.0
                }

        return None

class SuspiciousActivityEngine:
    """
    Unified rule-based Suspicious Activity Engine combining:
    - Loitering dwell time
    - Repeated zone entry
    - Unusual / rapid movement
    - Abandoned stationary object
    """
    def __init__(self):
        self.loitering_detector = LoiteringDetector()
        self.repeated_entry_detector = RepeatedZoneEntryDetector()
        self.unusual_movement_detector = UnusualMovementDetector()
        self.abandoned_detector = AbandonedObjectDetector()
