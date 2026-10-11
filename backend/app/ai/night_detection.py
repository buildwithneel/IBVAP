import cv2
import numpy as np
from collections import deque
from datetime import datetime, time, timezone
from typing import Dict, Any, Optional
from app.core.config import settings

class NightMovementDetector:
    """
    Night Movement & Low-Light Analysis Engine.
    Decoupled Architecture:
    1. Visual Scene Analysis: Computes frame luminance (0-255) and HSV color saturation.
       Daytime videos are NEVER falsely classified as night, even if processed at 2:00 AM server time.
    2. Midnight-crossing wall clock check as secondary context.
    3. Rolling window luminance stability per camera to ignore lighting flashes.
    4. Startup grace period (e.g. 15 frames) to allow tracker stabilization.
    """
    def __init__(
        self,
        start_time_str: Optional[str] = None,
        end_time_str: Optional[str] = None,
        low_light_threshold: Optional[float] = None,
        window_size: Optional[int] = None
    ):
        start_str = start_time_str or settings.NIGHT_START_TIME
        end_str = end_time_str or settings.NIGHT_END_TIME
        self.start_time = self._parse_time(start_str)
        self.end_time = self._parse_time(end_str)
        # Night darkness threshold (default luminance < 55.0)
        self.low_light_threshold = low_light_threshold or settings.LOW_LIGHT_THRESHOLD
        self.window_size = window_size or settings.LOW_LIGHT_CONFIRMATION_FRAMES

        # Per-camera rolling luminance window: camera_id -> deque of float
        self.camera_luminance_history: Dict[str, deque] = {}

    @staticmethod
    def _parse_time(t_str: str) -> time:
        parts = [int(p) for p in t_str.split(':')]
        return time(parts[0], parts[1])

    def is_night_time(self, dt: datetime) -> bool:
        """Determines if wall clock datetime falls within the night window."""
        t = dt.time()
        if self.start_time > self.end_time:
            # Window crosses midnight (e.g., 20:00 -> 06:00)
            return t >= self.start_time or t < self.end_time
        else:
            return self.start_time <= t < self.end_time

    @staticmethod
    def calculate_scene_metrics(frame: np.ndarray) -> tuple[float, float]:
        """
        Calculates average grayscale luminance and average color saturation.
        Daytime images typically have luminance > 70 and saturation > 40.
        Nighttime images have low luminance (< 50) and low saturation (< 30).
        """
        if frame is None or frame.size == 0:
            return 128.0, 50.0

        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            sat = hsv[:, :, 1]
            avg_sat = float(np.mean(sat))
        else:
            gray = frame
            avg_sat = 0.0

        avg_lum = float(np.mean(gray))
        return round(avg_lum, 2), round(avg_sat, 2)

    def analyze(
        self,
        dt: datetime,
        frame: Optional[np.ndarray] = None,
        camera_id: str = "default",
        frame_number: int = 0
    ) -> Dict[str, Any]:
        """
        Analyzes scene visual characteristics and timestamp.
        Returns dict with decoupled visual night and time-of-day metrics.
        """
        is_time_night = self.is_night_time(dt)

        if frame is not None:
            luminance, saturation = self.calculate_scene_metrics(frame)
        else:
            luminance, saturation = 128.0, 50.0

        # Maintain rolling luminance window for temporal stability
        if camera_id not in self.camera_luminance_history:
            self.camera_luminance_history[camera_id] = deque(maxlen=self.window_size)

        self.camera_luminance_history[camera_id].append(luminance)
        history = self.camera_luminance_history[camera_id]
        rolling_luminance = round(float(np.median(history)), 2)

        # Visual night condition:
        # Scene is truly dark if rolling luminance is below threshold (e.g. < 55)
        # Or if rolling luminance < 75 AND saturation is very low (< 25)
        visual_darkness = (rolling_luminance < self.low_light_threshold) or (
            rolling_luminance < 75.0 and saturation < 25.0
        )

        # A scene is classified as NIGHT only if visually dark.
        # Wall clock is recorded as context but does NOT force daylight video into night mode.
        is_night = visual_darkness

        # In grace period if frame_number is under 15 frames
        in_grace_period = frame_number < 15

        return {
            "is_night": is_night,
            "visual_darkness": visual_darkness,
            "is_time_night": is_time_night,
            "luminance": luminance,
            "rolling_luminance": rolling_luminance,
            "saturation": saturation,
            "low_light": rolling_luminance < self.low_light_threshold,
            "time_of_day": "night" if is_time_night else "day",
            "in_grace_period": in_grace_period
        }
