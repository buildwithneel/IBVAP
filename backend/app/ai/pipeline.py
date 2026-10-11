import cv2
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Set, Tuple
from app.ai.detector import YOLODetector
from app.ai.tracker import ByteTracker, SimpleByteTracker
from app.ai.face import FaceDetector
from app.ai.anpr import ANPREngine
from app.ai.zones import ZoneChecker
from app.ai.behaviour import LoiteringDetector, RepeatedZoneEntryDetector, UnusualMovementDetector
from app.ai.night_detection import NightMovementDetector
from app.ai.reid import global_identity_manager
from app.services.rule_service import rule_service
from app.core.config import settings
from app.core.logging import logger

class AIPipeline:
    """
    Unified Computer Vision Inference Pipeline.
    Orchestrates:
    - YOLOv8 Object Detection (Person, Vehicles, Two-wheelers, Non-standard targets)
    - ByteTrack Kalman Multi-Object Tracking (Tracks continuous IDs, displacement, velocity)
    - Cross-Camera Person Re-ID (Decoupled Local Track ID vs Global Person ID P-0001...)
    - Dedicated ANPR Pipeline with Temporal Track Voting
    - Zone Intrusion and Loitering Analytics
    - Night Movement Analytics Decoupled from Server Clock & Verified with Centroid Displacement
    """
    def __init__(self):
        self.detector = YOLODetector()
        self.tracker = ByteTracker()
        self.face_detector = FaceDetector()
        self.anpr_engine = ANPREngine()
        self.zone_checker = ZoneChecker()
        self.loitering_detector = LoiteringDetector()
        self.repeated_entry_detector = RepeatedZoneEntryDetector()
        self.unusual_movement_detector = UnusualMovementDetector()
        self.night_detector = NightMovementDetector()

        # Cooldown and debouncing sets
        self.night_track_cooldown: Dict[Tuple[str, int], datetime] = {}
        self.anpr_alerted_tracks: Set[Tuple[str, int]] = set()
        self.last_anpr_frame: Dict[int, int] = {}

    def handle_playback_loop(self, camera_id: str, db=None):
        """
        Detects video playback restart and resets/reinitializes tracking and detector states
        appropriately without generating duplicate alerts from previous playback cycles.
        """
        logger.info(f"[AIPipeline] Playback loop detected for camera '{camera_id}'. Reinitializing tracking state.")
        self.tracker.reset(keep_stats=True)
        self.zone_checker.track_states = {k: v for k, v in self.zone_checker.track_states.items() if k[0] != camera_id}
        self.zone_checker.track_trajectories = {k: v for k, v in self.zone_checker.track_trajectories.items() if k[0] != camera_id}
        self.zone_checker.last_line_crossing = {k: v for k, v in self.zone_checker.last_line_crossing.items() if k[0] != camera_id}
        self.anpr_alerted_tracks = {k for k in self.anpr_alerted_tracks if k[0] != camera_id}
        self.night_track_cooldown = {k: v for k, v in self.night_track_cooldown.items() if k[0] != camera_id}
        self.last_anpr_frame = {k: v for k, v in self.last_anpr_frame.items() if k != camera_id}
        self.loitering_detector.zone_entry_timestamps = {k: v for k, v in self.loitering_detector.zone_entry_timestamps.items() if k[0] != camera_id}
        self.loitering_detector.loitering_alerted = {k: v for k, v in self.loitering_detector.loitering_alerted.items() if k[0] != camera_id}
        self.repeated_entry_detector.entry_timestamps = {k: v for k, v in self.repeated_entry_detector.entry_timestamps.items() if k[0] != camera_id}
        self.repeated_entry_detector.alerted_episodes = {k: v for k, v in self.repeated_entry_detector.alerted_episodes.items() if k[0] != camera_id}
        self.unusual_movement_detector.last_positions = {k: v for k, v in self.unusual_movement_detector.last_positions.items() if k[0] != camera_id}
        self.unusual_movement_detector.alerted_tracks = {k: v for k, v in self.unusual_movement_detector.alerted_tracks.items() if k[0] != camera_id}
        
        from app.services.event_service import EventService
        EventService.handle_camera_loop(camera_id, db=db)

    def process_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        timestamp: datetime,
        frame_number: int,
        zones: List[Dict[str, Any]],
        watchlist_values: List[str]
    ) -> Dict[str, Any]:
        """
        Executes full AI pipeline on a single frame.
        """
        if frame is None or frame.size == 0:
            return {"detections": [], "candidate_events": []}

        if timestamp is not None and timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        elif timestamp is None:
            timestamp = datetime.now(timezone.utc)

        height, width = frame.shape[:2]

        # 1. Primary YOLO Object Detection (Person, Cars, Two-Wheelers, Animals/Bicycles)
        raw_detections = self.detector.detect(frame)

        # 2. Face Bounding Box Detection
        face_detections = self.face_detector.detect_faces(frame)
        all_raw_detections = raw_detections + face_detections

        # 3. Object Tracking (Kalman ByteTrack + Re-ID Appearance Recovery)
        tracked_detections = self.tracker.update(all_raw_detections, frame=frame)

        # 4. Decoupled Visual Night & Luminance Context
        night_info = self.night_detector.analyze(
            dt=timestamp,
            frame=frame,
            camera_id=camera_id,
            frame_number=frame_number
        )

        candidate_events = []
        watchlist_set = set(val.upper() for val in watchlist_values)
        active_track_ids = set()

        for det in tracked_detections:
            track_id = det.get('track_id')
            if track_id:
                active_track_ids.add(track_id)

            class_name = det['class_name']
            bbox = det['bbox']  # [x1, y1, x2, y2]
            confidence = det['confidence']
            x1, y1, x2, y2 = [int(max(0, c)) for c in bbox]

            # 5. Cross-Camera Person Re-ID
            if class_name == 'person':
                person_crop = frame[y1:y2, x1:x2]
                gid, sim, is_new = global_identity_manager.identify_or_register(
                    camera_id=camera_id,
                    local_track_id=track_id,
                    person_crop=person_crop
                )
                if gid:
                    det['global_person_id'] = gid
                    det['reid_similarity'] = sim

                    # Check watchlist for Person Global ID (ONLY if WATCHLIST_MATCH rule enabled)
                    if gid.upper() in watchlist_set and rule_service.is_rule_enabled("WATCHLIST_MATCH"):
                        candidate_events.append({
                            "event_type": "WATCHLIST_MATCH",
                            "camera_id": camera_id,
                            "track_id": track_id,
                            "confidence": confidence,
                            "object": {
                                "class_name": class_name,
                                "object_id": track_id,
                                "global_person_id": gid,
                                "confidence": confidence,
                                "bounding_box": bbox
                            },
                            "context": night_info,
                            "frame": frame
                        })

            # 6. Vehicle ANPR Execution with Temporal Voting
            plate_info = None
            if class_name in ['car', 'truck', 'bus', 'motorcycle']:
                veh_crop = frame[y1:y2, x1:x2]
                if veh_crop.size > 0:
                    # Check if already resolved in ANPREngine
                    if track_id is not None and track_id in self.anpr_engine.track_resolved:
                        plate_info = self.anpr_engine.track_resolved[track_id]
                    elif track_id is not None and (frame_number - self.last_anpr_frame.get(track_id, -999) < 6):
                        # Use best existing candidate without running OCR on this frame
                        if track_id in self.anpr_engine.track_votes and self.anpr_engine.track_votes[track_id]:
                            best_text = max(self.anpr_engine.track_votes[track_id], key=self.anpr_engine.track_votes[track_id].get)
                            plate_info = {
                                "plate_number": best_text,
                                "confidence": 0.5,
                                "status": "TRACK_VOTED"
                            }
                        else:
                            plate_info = {"plate_number": "UNKNOWN", "confidence": 0.0, "status": "PENDING"}
                    else:
                        if track_id is not None:
                            self.last_anpr_frame[track_id] = frame_number
                        plate_info = self.anpr_engine.process_vehicle_crop(veh_crop, track_id=track_id)

                    if plate_info:
                        det['plate_number'] = plate_info['plate_number']
                        det['plate_confidence'] = plate_info['confidence']
                        det['plate_status'] = plate_info['status']

                        plate_crop_img = plate_info.get('plate_crop')
                        if plate_crop_img is None and track_id is not None and track_id in self.anpr_engine.track_plate_crops:
                            plate_crop_img = self.anpr_engine.track_plate_crops[track_id]

                        # Debounced ANPR Detection Event:
                        # MANDATORY REQUIREMENT: ANPR MUST remain disabled unless explicitly enabled!
                        # A vehicle passing normally on a highway must NOT generate an alert or ANPR event.
                        anpr_key = (camera_id, track_id)
                        if plate_info['plate_number'] != 'UNKNOWN' and anpr_key not in self.anpr_alerted_tracks:
                            self.anpr_alerted_tracks.add(anpr_key)

                            if rule_service.is_rule_enabled("ANPR_DETECTED"):
                                candidate_events.append({
                                    "event_type": "ANPR_DETECTED",
                                    "camera_id": camera_id,
                                    "track_id": track_id,
                                    "confidence": plate_info['confidence'],
                                    "plate_number": plate_info['plate_number'],
                                    "plate_crop": plate_crop_img.copy() if plate_crop_img is not None else None,
                                    "vehicle_crop": veh_crop.copy() if veh_crop is not None else None,
                                    "object": {
                                        "class_name": class_name,
                                        "object_id": track_id,
                                        "confidence": confidence,
                                        "bounding_box": bbox,
                                        "plate_number": plate_info['plate_number'],
                                        "plate_bbox": plate_info.get('plate_bbox')
                                    },
                                    "context": night_info,
                                    "frame": frame.copy()
                                })

                            # Watchlist Matching Check (Separate rule from pure ANPR)
                            if (plate_info['plate_number'].upper() in watchlist_set 
                                    and rule_service.is_rule_enabled("WATCHLIST_MATCH")):
                                candidate_events.append({
                                    "event_type": "WATCHLIST_MATCH",
                                    "camera_id": camera_id,
                                    "track_id": track_id,
                                    "confidence": plate_info['confidence'],
                                    "plate_number": plate_info['plate_number'],
                                    "plate_crop": plate_crop_img.copy() if plate_crop_img is not None else None,
                                    "vehicle_crop": veh_crop.copy() if veh_crop is not None else None,
                                    "object": {
                                        "class_name": class_name,
                                        "object_id": track_id,
                                        "confidence": confidence,
                                        "bounding_box": bbox,
                                        "plate_number": plate_info['plate_number'],
                                        "plate_bbox": plate_info.get('plate_bbox')
                                    },
                                    "context": night_info,
                                    "frame": frame.copy()
                                })

            # Check Unusual Movement rule if enabled (Require confirmed track, not coasting)
            is_confirmed_track = (det.get('track_state') == 'CONFIRMED' and not det.get('is_coasting'))
            if track_id and rule_service.is_rule_enabled("UNUSUAL_MOVEMENT") and is_confirmed_track:
                cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
                mov_event = self.unusual_movement_detector.update_track_position(
                    camera_id=camera_id,
                    track_id=track_id,
                    center_pt=(cx, cy),
                    class_name=class_name,
                    confidence=confidence,
                    current_time=timestamp
                )
                if mov_event:
                    candidate_events.append({
                        "event_type": "UNUSUAL_MOVEMENT",
                        "camera_id": camera_id,
                        "track_id": track_id,
                        "confidence": confidence,
                        "object": {
                            "class_name": class_name,
                            "object_id": track_id,
                            "confidence": confidence,
                            "bounding_box": bbox,
                            "speed_px_sec": mov_event.get("speed_px_sec")
                        },
                        "context": night_info,
                        "frame": frame
                    })

            # 7. Night Movement Verification Logic: require confirmed track, non-coasting, movement persistence and minimum confidence
            min_motion_conf = getattr(settings, 'MOTION_ALERT_MIN_CONFIDENCE', 0.40)
            can_trigger_night_movement = (
                rule_service.is_rule_enabled("NIGHT_MOVEMENT")
                and is_confirmed_track
                and not night_info.get('in_grace_period', False)
                and night_info.get('is_night', False)
                and det.get('has_moved', False)
                and confidence >= min_motion_conf
            )

            # Zone Rules & Virtual Fence Evaluation
            if zones and not det.get('is_coasting'):
                for z in zones:
                    # Mandatory HITL Requirement: Skip unconfirmed, draft, or rejected zones
                    z_status = z.get('status', 'CONFIRMED')
                    if z_status not in ["CONFIRMED", "active"]:
                        continue

                    z_id = z['id']
                    z_name = z['name']
                    polygon = z['polygon']
                    z_kind = z.get('zone_kind', 'POLYGON')
                    z_direction = z.get('crossing_direction', 'both')
                    monitored_objs = z.get('monitored_objects') or ["person", "car", "truck", "motorcycle"]

                    # Filter by monitored object class
                    if class_name not in monitored_objs and 'both' not in monitored_objs:
                        continue

                    # Denormalize polygon/line coordinates if scaled 0-1
                    denorm_poly = []
                    for pt in polygon:
                        px = pt[0] * width if pt[0] <= 1.0 else pt[0]
                        py = pt[1] * height if pt[1] <= 1.0 else pt[1]
                        denorm_poly.append([px, py])

                    if z_kind == "LINE":
                        # 2D Line Crossing Evaluation (ONLY if LINE_CROSSING rule enabled)
                        if rule_service.is_rule_enabled("LINE_CROSSING"):
                            line_event = self.zone_checker.check_line_crossing(
                                camera_id, z_id, z_name, denorm_poly, track_id, bbox,
                                configured_direction=z_direction, timestamp=timestamp
                            )
                            if line_event:
                                candidate_events.append({
                                    "event_type": "LINE_CROSSING",
                                    "camera_id": camera_id,
                                    "track_id": track_id,
                                    "confidence": confidence,
                                    "zone": {"zone_id": z_id, "name": z_name},
                                    "object": {
                                        "class_name": class_name,
                                        "object_id": track_id,
                                        "global_person_id": det.get('global_person_id'),
                                        "confidence": confidence,
                                        "bounding_box": bbox
                                    },
                                    "context": night_info,
                                    "frame": frame
                                })
                    else:
                        # Polygon Intrusion Lifecycle Evaluation
                        zone_res = self.zone_checker.check_zone_transitions(
                            camera_id, z_id, z_name, denorm_poly, track_id, bbox, timestamp=timestamp
                        )

                        # Intrusion Event Trigger (CONFIRMED_ENTRY transition)
                        if zone_res['transition'] == "ENTERED" and rule_service.is_rule_enabled("RESTRICTED_ENTRY"):
                            candidate_events.append({
                                "event_type": "INTRUSION",
                                "camera_id": camera_id,
                                "track_id": track_id,
                                "confidence": confidence,
                                "zone": {"zone_id": z_id, "name": z_name},
                                "object": {
                                    "class_name": class_name,
                                    "object_id": track_id,
                                    "global_person_id": det.get('global_person_id'),
                                    "confidence": confidence,
                                    "bounding_box": bbox
                                },
                                "context": night_info,
                                "frame": frame
                            })

                        # Check Repeated Zone Entry rule
                        if zone_res['transition'] == "ENTERED" and rule_service.is_rule_enabled("REPEATED_ENTRY"):
                            rep_event = self.repeated_entry_detector.register_zone_entry(
                                camera_id, z_id, track_id, current_time=timestamp
                            )
                            if rep_event:
                                candidate_events.append({
                                    "event_type": "REPEATED_ENTRY",
                                    "camera_id": camera_id,
                                    "track_id": track_id,
                                    "confidence": confidence,
                                    "zone": {"zone_id": z_id, "name": z_name},
                                    "object": {
                                        "class_name": class_name,
                                        "object_id": track_id,
                                        "confidence": confidence,
                                        "bounding_box": bbox
                                    },
                                    "context": night_info,
                                    "frame": frame
                                })

                        # Dwell Time Loitering Detection Check
                        if rule_service.is_rule_enabled("LOITERING"):
                            loiter_event = self.loitering_detector.update_track_presence(
                                camera_id, z_id, track_id, zone_res['is_inside'], timestamp=timestamp
                            )
                            if loiter_event:
                                candidate_events.append({
                                    "event_type": "LOITERING",
                                    "camera_id": camera_id,
                                    "track_id": track_id,
                                    "confidence": confidence,
                                    "zone": {"zone_id": z_id, "name": z_name},
                                    "object": {
                                        "class_name": class_name,
                                        "object_id": track_id,
                                        "global_person_id": det.get('global_person_id'),
                                        "confidence": confidence,
                                        "bounding_box": bbox
                                    },
                                    "context": night_info,
                                    "frame": frame
                                })

                        # Verified Night Movement in Zone
                        if zone_res['transition'] == "ENTERED" and can_trigger_night_movement:
                            night_key = (camera_id, track_id)
                            last_alert = self.night_track_cooldown.get(night_key)
                            last_alert_utc = last_alert.replace(tzinfo=timezone.utc) if (last_alert and last_alert.tzinfo is None) else last_alert
                            if last_alert_utc is None or (timestamp - last_alert_utc).total_seconds() > 10.0:
                                self.night_track_cooldown[night_key] = timestamp
                                candidate_events.append({
                                    "event_type": "NIGHT_MOVEMENT",
                                    "camera_id": camera_id,
                                    "track_id": track_id,
                                    "confidence": confidence,
                                    "zone": {"zone_id": z_id, "name": z_name},
                                    "object": {
                                        "class_name": class_name,
                                        "object_id": track_id,
                                        "global_person_id": det.get('global_person_id'),
                                        "confidence": confidence,
                                        "bounding_box": bbox,
                                        "displacement_10f": det.get('displacement_10f')
                                    },
                                    "context": night_info,
                                    "frame": frame
                                })
            else:
                # No zones defined: camera-wide verified night movement
                if can_trigger_night_movement and track_id:
                    night_key = (camera_id, track_id)
                    last_alert = self.night_track_cooldown.get(night_key)
                    last_alert_utc = last_alert.replace(tzinfo=timezone.utc) if (last_alert and last_alert.tzinfo is None) else last_alert
                    if last_alert_utc is None or (timestamp - last_alert_utc).total_seconds() > 10.0:
                        self.night_track_cooldown[night_key] = timestamp
                        candidate_events.append({
                            "event_type": "NIGHT_MOVEMENT",
                            "camera_id": camera_id,
                            "track_id": track_id,
                            "confidence": confidence,
                            "zone": None,
                            "object": {
                                "class_name": class_name,
                                "object_id": track_id,
                                "global_person_id": det.get('global_person_id'),
                                "confidence": confidence,
                                "bounding_box": bbox,
                                "displacement_10f": det.get('displacement_10f')
                            },
                            "context": night_info,
                            "frame": frame
                        })

        # Clean up stale track state
        self.zone_checker.cleanup_stale_tracks(active_track_ids, current_time=timestamp)
        self.anpr_alerted_tracks = {k for k in self.anpr_alerted_tracks if k[1] in active_track_ids}
        self.night_track_cooldown = {k: v for k, v in self.night_track_cooldown.items() if k[1] in active_track_ids}
        self.last_anpr_frame = {k: v for k, v in self.last_anpr_frame.items() if k in active_track_ids}

        return {
            "detections": tracked_detections,
            "candidate_events": candidate_events
        }
