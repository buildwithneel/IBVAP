import cv2
import numpy as np
from datetime import datetime, timezone
from typing import List, Dict, Tuple, Set, Any, Optional
from app.core.config import settings

def _to_utc(dt: Optional[datetime]) -> datetime:
    """Ensure datetime is timezone-aware UTC datetime."""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

class ZoneChecker:
    """
    Polygon-based Virtual Fence Zone Engine with State Machine & Hysteresis.
    Uses reference point (bottom-center of bounding box) to determine zone inclusion.
    Implements full lifecycle: OUTSIDE -> POSSIBLE_ENTRY -> CONFIRMED_ENTRY -> INSIDE -> EXITED.
    Emits transition="ENTERED" ONLY upon CONFIRMED_ENTRY to eliminate alert noise.
    Supports track state TTL retention to resist temporary tracker loss/flicker.
    """
    def __init__(
        self,
        confirmation_frames: Optional[int] = None,
        ttl_seconds: Optional[float] = None
    ):
        self.confirmation_frames = confirmation_frames or settings.ZONE_CONFIRMATION_FRAMES
        self.ttl_seconds = ttl_seconds or settings.TRACK_STATE_TTL_SECONDS

        # Maps (camera_id, zone_id, track_id) -> bool (is_inside) - maintained for backward compatibility
        self.track_zone_state: Dict[Tuple[str, str, int], bool] = {}

        # Maps (camera_id, zone_id, track_id) -> state dict
        # state: "OUTSIDE" | "POSSIBLE_ENTRY" | "CONFIRMED_ENTRY" | "INSIDE"
        # frame_count: int
        # last_seen: datetime
        self.track_states: Dict[Tuple[str, str, int], Dict[str, Any]] = {}

        # Maps (camera_id, track_id) -> list of recent bottom-center points [(x, y), ...]
        self.track_trajectories: Dict[Tuple[str, int], List[Tuple[float, float]]] = {}

        # Maps (camera_id, zone_id, track_id) -> datetime of last triggered line crossing
        self.last_line_crossing: Dict[Tuple[str, str, int], datetime] = {}

    @staticmethod
    def get_bottom_center(bbox: List[float]) -> Tuple[float, float]:
        """Calculates bottom-center point of bounding box [x1, y1, x2, y2]."""
        x1, y1, x2, y2 = bbox
        cx = (x1 + x2) / 2.0
        cy = y2
        return cx, cy

    @staticmethod
    def is_point_in_polygon(point: Tuple[float, float], polygon: List[List[float]]) -> bool:
        """
        Ray-casting algorithm using OpenCV pointPolygonTest.
        Returns True if point is inside or on the boundary of polygon.
        """
        if len(polygon) < 3:
            return False

        pts = np.array(polygon, dtype=np.float32)
        dist = cv2.pointPolygonTest(pts, point, False)
        return dist >= 0

    @staticmethod
    def line_segments_intersect(
        p1: Tuple[float, float], p2: Tuple[float, float],
        q1: Tuple[float, float], q2: Tuple[float, float]
    ) -> Tuple[bool, str]:
        """
        Calculates 2D segment intersection between line fence (p1, p2) and movement trajectory (q1, q2).
        Returns (intersects: bool, direction: 'inbound' | 'outbound').
        """
        def ccw(A, B, C):
            return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])

        intersects = (ccw(p1, q1, q2) != ccw(p2, q1, q2)) and (ccw(p1, p2, q1) != ccw(p1, p2, q2))
        if not intersects:
            return False, "none"

        # Cross product vector direction test
        line_vec = (p2[0] - p1[0], p2[1] - p1[1])
        move_vec = (q2[0] - q1[0], q2[1] - q1[1])
        cross = line_vec[0] * move_vec[1] - line_vec[1] * move_vec[0]
        direction = "inbound" if cross >= 0 else "outbound"
        return True, direction

    def check_line_crossing(
        self,
        camera_id: str,
        zone_id: str,
        zone_name: str,
        line_points: List[List[float]],
        track_id: int,
        bbox: List[float],
        configured_direction: str = "both",
        cooldown_seconds: float = 5.0,
        timestamp: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Checks 2D line crossing for a track against a LINE virtual fence segment.
        Returns event dict if crossing detected and cooldown has elapsed.
        """
        if len(line_points) < 2:
            return None

        now = timestamp or datetime.now(timezone.utc)
        curr_pt = self.get_bottom_center(bbox)
        traj_key = (camera_id, track_id)

        history = self.track_trajectories.get(traj_key, [])
        history.append(curr_pt)
        if len(history) > 10:
            history = history[-10:]
        self.track_trajectories[traj_key] = history

        if len(history) < 2:
            return None

        prev_pt = history[-2]
        p1, p2 = (line_points[0][0], line_points[0][1]), (line_points[1][0], line_points[1][1])

        intersects, direction = self.line_segments_intersect(p1, p2, prev_pt, curr_pt)
        if not intersects:
            return None

        # Check configured direction filter (both, inbound, outbound)
        if configured_direction != "both" and direction != configured_direction:
            return None

        # Jitter suppression cooldown check
        now = _to_utc(timestamp)
        cross_key = (camera_id, zone_id, track_id)
        last_time = self.last_line_crossing.get(cross_key)
        if last_time:
            last_time = _to_utc(last_time)
            if (now - last_time).total_seconds() < cooldown_seconds:
                return None

        self.last_line_crossing[cross_key] = now
        return {
            "event_type": "LINE_CROSSING",
            "zone_id": zone_id,
            "zone_name": zone_name,
            "crossing_direction": direction,
            "configured_direction": configured_direction
        }

    def check_zone_transitions(
        self,
        camera_id: str,
        zone_id: str,
        zone_name: str,
        polygon: List[List[float]],
        track_id: int,
        bbox: List[float],
        timestamp: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Checks lifecycle transition for a single track_id in a zone.
        State Machine: OUTSIDE -> POSSIBLE_ENTRY -> CONFIRMED_ENTRY -> INSIDE -> EXITED.
        Returns state dict:
        {
           "is_inside": bool,
           "is_confirmed": bool,
           "state": str,
           "transition": "ENTERED" | "EXITED" | "NONE",
           "zone_id": str,
           "zone_name": str
        }
        """
        now = timestamp or datetime.now(timezone.utc)
        point = self.get_bottom_center(bbox)
        is_point_inside = self.is_point_in_polygon(point, polygon)
        key = (camera_id, zone_id, track_id)

        track_data = self.track_states.get(key, {
            "state": "OUTSIDE",
            "frame_count": 0,
            "last_seen": now
        })

        current_state = track_data["state"]
        frame_count = track_data["frame_count"]
        transition = "NONE"
        new_state = current_state

        if is_point_inside:
            if current_state == "OUTSIDE":
                frame_count = 1
                if frame_count >= self.confirmation_frames:
                    new_state = "CONFIRMED_ENTRY"
                    transition = "ENTERED"
                else:
                    new_state = "POSSIBLE_ENTRY"
            elif current_state == "POSSIBLE_ENTRY":
                frame_count += 1
                if frame_count >= self.confirmation_frames:
                    new_state = "CONFIRMED_ENTRY"
                    transition = "ENTERED"
                else:
                    new_state = "POSSIBLE_ENTRY"
            elif current_state == "CONFIRMED_ENTRY":
                new_state = "INSIDE"
                transition = "NONE"
            elif current_state == "INSIDE":
                new_state = "INSIDE"
                transition = "NONE"
        else:
            if current_state in ("CONFIRMED_ENTRY", "INSIDE"):
                new_state = "OUTSIDE"
                transition = "EXITED"
                frame_count = 0
            else:
                new_state = "OUTSIDE"
                transition = "NONE"
                frame_count = 0

        # Update state storage
        self.track_states[key] = {
            "state": new_state,
            "frame_count": frame_count,
            "last_seen": now
        }

        is_confirmed_inside = new_state in ("CONFIRMED_ENTRY", "INSIDE")
        self.track_zone_state[key] = is_confirmed_inside

        return {
            "is_inside": is_confirmed_inside,
            "is_confirmed": is_confirmed_inside,
            "state": new_state,
            "transition": transition,
            "zone_id": zone_id,
            "zone_name": zone_name
        }

    def cleanup_stale_tracks(self, active_track_ids: Set[int], current_time: Optional[datetime] = None):
        """
        Cleans up stored tracking states for disappeared objects using TRACK_STATE_TTL_SECONDS.
        Does not immediately expire tracks missing for only a frame or two.
        """
        now = _to_utc(current_time)
        stale_keys = []

        for key, data in self.track_states.items():
            t_id = key[2]
            if t_id not in active_track_ids:
                last_seen = _to_utc(data.get("last_seen", now))
                elapsed = (now - last_seen).total_seconds()
                if elapsed >= self.ttl_seconds:
                    stale_keys.append(key)

        for key in stale_keys:
            self.track_states.pop(key, None)
            self.track_zone_state.pop(key, None)
