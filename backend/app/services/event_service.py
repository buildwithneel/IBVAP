import uuid
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Set
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.db.models.models import Event, Evidence, Incident, Camera
from app.services.evidence_service import EvidenceService
from app.services.audit_service import AuditService
from app.core.config import settings
from app.core.logging import logger

def _to_utc(dt: Optional[datetime]) -> datetime:
    """Ensure datetime is timezone-aware UTC datetime."""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

class EventService:
    # Memory cache for event debouncing/cooldown: (camera_id, zone_id, track_id, event_type) -> last_event_time
    _cooldown_cache: Dict[tuple, datetime] = {}
    # Active event registry for lifecycle tracking: (camera_id, zone_id, track_id, event_type) -> event_id
    _active_events: Dict[tuple, str] = {}
    _active_event_last_seen: Dict[tuple, datetime] = {}
    _active_event_best_quality: Dict[tuple, float] = {}
    # Vehicle session registry for continuous appearances (~10s window): camera_id -> list of session dicts
    _vehicle_sessions: Dict[str, List[Dict[str, Any]]] = {}
    _active_ws_connections: Set[Any] = set()
    _main_loop: Optional[Any] = None

    @classmethod
    def set_main_loop(cls, loop):
        cls._main_loop = loop

    @classmethod
    def register_ws(cls, websocket):
        cls._active_ws_connections.add(websocket)
        try:
            cls._main_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

    @classmethod
    def unregister_ws(cls, websocket):
        cls._active_ws_connections.discard(websocket)

    @classmethod
    async def broadcast_ws(cls, payload: Dict[str, Any]):
        if not cls._active_ws_connections:
            return
        dead = set()
        for ws in list(cls._active_ws_connections):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            cls._active_ws_connections.discard(ws)

    @classmethod
    def broadcast_sync(cls, payload: Dict[str, Any]):
        if not cls._active_ws_connections:
            return
        try:
            loop = cls._main_loop
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(cls.broadcast_ws(payload), loop)
            else:
                try:
                    cur_loop = asyncio.get_event_loop()
                    if cur_loop.is_running():
                        cur_loop.create_task(cls.broadcast_ws(payload))
                except Exception:
                    pass
        except Exception as e:
            logger.debug(f"broadcast_sync error: {e}")

    _telemetry_thread: Optional[Any] = None
    _telemetry_stop_event: Optional[Any] = None

    @classmethod
    def start_telemetry_broadcaster(cls):
        import threading
        if cls._telemetry_thread and cls._telemetry_thread.is_alive():
            return
        cls._telemetry_stop_event = threading.Event()
        cls._telemetry_thread = threading.Thread(target=cls._telemetry_broadcaster_loop, daemon=True)
        cls._telemetry_thread.start()
        logger.info("Camera Telemetry & Heartbeat broadcaster thread started.")

    @classmethod
    def stop_telemetry_broadcaster(cls):
        if cls._telemetry_stop_event:
            cls._telemetry_stop_event.set()

    @classmethod
    def get_telemetry_snapshot(cls) -> Dict[str, Any]:
        from app.workers.video_worker import worker_manager
        from app.db.database import SessionLocal
        db = SessionLocal()
        try:
            cams = db.query(Camera).all()
            cam_telemetry = []
            active_count = 0
            for c in cams:
                is_alive = worker_manager.is_running(c.id)
                t = worker_manager.get_telemetry(c.id)
                cur_status = worker_manager.get_status(c.id) if is_alive else (c.status or "STOPPED")
                if is_alive:
                    active_count += 1
                cam_telemetry.append({
                    "camera_id": c.id,
                    "name": c.name,
                    "status": cur_status,
                    "fps": t.get("fps"),
                    "latency_ms": t.get("latency_ms"),
                    "resolution": t.get("resolution"),
                    "active_tracks": t.get("active_tracks", 0),
                    "frames_processed": t.get("frames_processed", 0),
                    "uptime_seconds": t.get("uptime_seconds", 0),
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            return {
                "type": "CAMERA_HEARTBEAT",
                "cameras": cam_telemetry,
                "active_count": active_count,
                "total_count": len(cams),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        finally:
            db.close()

    @classmethod
    def _telemetry_broadcaster_loop(cls):
        import time
        while cls._telemetry_stop_event and not cls._telemetry_stop_event.is_set():
            try:
                time.sleep(2.5)
                if not cls._active_ws_connections:
                    continue
                snapshot = cls.get_telemetry_snapshot()
                cls.broadcast_sync(snapshot)
            except Exception as e:
                logger.debug(f"Telemetry broadcaster loop error: {e}")

    @classmethod
    def broadcast_camera_lifecycle(cls, event_type: str, camera_id: str, status: str, details: Optional[Dict[str, Any]] = None):
        payload = {
            "type": event_type,
            "camera_id": camera_id,
            "status": status,
            "timestamp": datetime.utcnow().isoformat()
        }
        if details:
            payload.update(details)
        cls.broadcast_sync(payload)

    @staticmethod
    def _calculate_iou(boxA, boxB) -> float:
        if not boxA or not boxB or len(boxA) < 4 or len(boxB) < 4:
            return 0.0
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])
        interArea = max(0, xB - xA) * max(0, yB - yA)
        boxAArea = max(1, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
        boxBArea = max(1, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))
        iou = interArea / float(boxAArea + boxBArea - interArea)
        return float(iou)

    @classmethod
    def handle_camera_loop(cls, camera_id: str, db: Optional[Session] = None):
        """
        Called when a video source restarts/loops playback.
        Resolves active events and resets session tracking states for that camera.
        """
        logger.info(f"[EventService] Handling playback loop for camera {camera_id}: resetting active lifecycle events.")
        keys_to_remove = [k for k in cls._active_events if k[0] == camera_id]
        for k in keys_to_remove:
            ev_id = cls._active_events.pop(k, None)
            cls._active_event_last_seen.pop(k, None)
            cls._cooldown_cache.pop(k, None)
            if db and ev_id:
                try:
                    ev = db.query(Event).filter(Event.id == ev_id).first()
                    if ev and ev.status == "active":
                        ev.status = "resolved"
                        db.commit()
                except Exception:
                    pass

        # Clear any remaining cooldowns and vehicle sessions for this camera
        cd_keys = [k for k in cls._cooldown_cache if k[0] == camera_id]
        for k in cd_keys:
            cls._cooldown_cache.pop(k, None)
        cls._vehicle_sessions.pop(camera_id, None)

    @classmethod
    def resolve_event_lifecycle(cls, event_id: str, db: Optional[Session] = None):
        """Marks event as resolved and purges from active event tracking."""
        keys = [k for k, v in cls._active_events.items() if v == event_id]
        for k in keys:
            cls._active_events.pop(k, None)
            cls._active_event_last_seen.pop(k, None)
            cls._active_event_best_quality.pop(k, None)
            # Retain cooldown so immediate duplicate trigger is debounced
            cls._cooldown_cache[k] = datetime.now(timezone.utc)
        for cam_id, sessions in list(cls._vehicle_sessions.items()):
            cls._vehicle_sessions[cam_id] = [s for s in sessions if s.get('event_id') != event_id]

    @staticmethod
    def calculate_risk_score_and_severity(event_type: str, context: Dict[str, Any]) -> tuple[int, str, List[str]]:
        """
        Deterministic, explainable risk score calculation.
        Returns (score, severity, factors).
        """
        score = 0
        factors = []

        is_night = context.get('is_night', False)
        low_light = context.get('low_light', False)
        is_restricted = context.get('is_restricted', False) or context.get('zone_type') in ['RESTRICTED', 'PROHIBITED', 'RED', 'HIGH_SECURITY']

        if event_type == "INTRUSION":
            score += 40
            factors.append("restricted_zone_intrusion")
        elif event_type == "LINE_CROSSING":
            score += 35
            factors.append("line_boundary_crossed")
        elif event_type == "LOITERING":
            score += 25
            factors.append("loitering_threshold_exceeded")
        elif event_type == "REPEATED_ENTRY":
            score += 45
            factors.append("repeated_zone_entries_detected")
        elif event_type == "UNUSUAL_MOVEMENT":
            score += 30
            factors.append("unusual_high_speed_movement")
        elif event_type == "ABANDONED_OBJECT":
            score += 40
            factors.append("unattended_stationary_object")
        elif event_type == "NIGHT_MOVEMENT":
            score += 40
            factors.append("restricted_night_movement")
        elif event_type == "ANPR_DETECTED":
            score += 15
            factors.append("vehicle_plate_captured")
        elif event_type == "WATCHLIST_MATCH":
            score += 55
            factors.append("watchlist_target_match")
        elif event_type == "CAMERA_OFFLINE":
            score += 30
            factors.append("camera_signal_lost")

        if is_night or low_light:
            score += 35
            factors.append("night_or_low_light_condition")

        if is_restricted:
            score += 35
            factors.append("high_security_restricted_zone")

        # Explicit critical hint from pipeline context
        if context.get('critical') or context.get('severity') == 'critical':
            score = max(score, 80)
            factors.append("operator_critical_priority")

        score = min(100, max(0, score))

        if score >= 75:
            severity = "CRITICAL"
        elif score >= 50:
            severity = "HIGH"
        elif score >= 25:
            severity = "MEDIUM"
        else:
            severity = "LOW"

        return score, severity, factors

    @classmethod
    def process_candidate_event(cls, db: Session, candidate: Dict[str, Any]) -> Optional[Event]:
        """
        Processes candidate event from AI pipeline with deduplication, lifecycle management,
        risk scoring, evidence creation, audit record logging, and reliable WebSocket dispatch.
        """
        camera_id = candidate['camera_id']
        event_type = candidate['event_type']
        track_id = candidate.get('track_id')
        zone_id = candidate.get('zone', {}).get('zone_id') if candidate.get('zone') else None
        now = datetime.now(timezone.utc)

        frame = candidate.get('frame')
        plate_crop = candidate.get('plate_crop')
        vehicle_crop = candidate.get('vehicle_crop')
        plate_number = candidate.get('plate_number') or (candidate.get('object', {}) or {}).get('plate_number')
        plate_confidence = candidate.get('confidence', 0.85)
        bbox = candidate.get('object', {}).get('bbox')
        class_name = (candidate.get('object', {}).get('class_name') or '').lower()

        is_vehicle = (
            event_type in ["ANPR_DETECTED", "WATCHLIST_MATCH", "VEHICLE_INTRUSION", "SPEEDING", "PARKING_VIOLATION"]
            or class_name in ["car", "truck", "bus", "motorcycle", "vehicle", "van"]
            or plate_number is not None
        )

        cand_quality = EvidenceService.compute_frame_quality_score(frame, plate_crop, plate_confidence)

        def _clean_plate(p):
            return "".join(c for c in str(p).upper() if c.isalnum()) if p else ""

        cand_plate_clean = _clean_plate(plate_number)

        # 1. Vehicle Continuous Appearance Deduplication (~10-12s window)
        if is_vehicle and camera_id in cls._vehicle_sessions:
            active_sessions = cls._vehicle_sessions[camera_id]
            valid_sessions = []
            matched_session = None

            for sess in active_sessions:
                time_diff = (now - _to_utc(sess['last_seen'])).total_seconds()
                if time_diff <= settings.VEHICLE_EVENT_GROUPING_WINDOW_SECONDS:
                    valid_sessions.append(sess)
                    if matched_session is None:
                        sess_plate_clean = _clean_plate(sess.get('plate_number'))
                        plate_match = bool(cand_plate_clean and sess_plate_clean and cand_plate_clean == sess_plate_clean)
                        track_match = bool(track_id is not None and sess.get('track_id') is not None and track_id == sess.get('track_id'))
                        iou_match = False
                        if not plate_match and not track_match and bbox and sess.get('bbox') and time_diff < 4.0:
                            iou = cls._calculate_iou(bbox, sess.get('bbox'))
                            if iou > 0.25:
                                iou_match = True

                        if plate_match or track_match or iou_match:
                            matched_session = sess

            cls._vehicle_sessions[camera_id] = valid_sessions

            if matched_session is not None:
                matched_session['last_seen'] = now
                if bbox:
                    matched_session['bbox'] = bbox
                if track_id is not None:
                    matched_session['track_id'] = track_id
                if cand_plate_clean and not matched_session.get('plate_number'):
                    matched_session['plate_number'] = plate_number

                existing_event = db.query(Event).filter(Event.id == matched_session['event_id']).first()
                if existing_event:
                    existing_event.status = "updated"
                    # Upgrade snapshot evidence if new candidate frame has higher quality score
                    if cand_quality > matched_session.get('best_quality', 0.0) and existing_event.evidence_id:
                        try:
                            updated_ev = EvidenceService.update_snapshot_evidence(
                                db=db,
                                evidence_id=existing_event.evidence_id,
                                frame=frame,
                                plate_crop=plate_crop,
                                vehicle_crop=vehicle_crop,
                                event_type=event_type,
                                timestamp=now,
                                confidence=plate_confidence
                            )
                            if updated_ev:
                                matched_session['best_quality'] = cand_quality
                                if existing_event.event_metadata:
                                    ev_meta = existing_event.event_metadata.get('evidence', {})
                                    ev_meta['snapshot_url'] = updated_ev.image_path
                                    ev_meta['sha256'] = updated_ev.sha256
                                    if updated_ev.plate_image_path:
                                        ev_meta['plate_image_url'] = updated_ev.plate_image_path
                                        ev_meta['plate_sha256'] = updated_ev.plate_sha256
                                    existing_event.event_metadata['evidence'] = ev_meta
                                    flag_modified(existing_event, 'event_metadata')
                        except Exception as e:
                            logger.error(f"Failed to update snapshot evidence with better frame: {e}")

                    # Update plate number in event metadata if newly recognized
                    if plate_number and existing_event.event_metadata:
                        ev_meta = existing_event.event_metadata.get('evidence', {})
                        if not ev_meta.get('plate_number'):
                            ev_meta['plate_number'] = plate_number
                            existing_event.event_metadata['evidence'] = ev_meta
                            flag_modified(existing_event, 'event_metadata')

                    db.commit()
                    return existing_event

        # 2. General Event Lifecycle: Check if continuous active event already exists
        lifecycle_key = (camera_id, zone_id, track_id, event_type)
        if lifecycle_key in cls._active_events:
            existing_event_id = cls._active_events[lifecycle_key]
            existing_event = db.query(Event).filter(Event.id == existing_event_id).first()
            if existing_event and existing_event.status in ["active", "updated"]:
                cls._active_event_last_seen[lifecycle_key] = now
                existing_event.status = "updated"
                prev_best = cls._active_event_best_quality.get(lifecycle_key, 0.0)
                if cand_quality > prev_best and existing_event.evidence_id:
                    try:
                        updated_ev = EvidenceService.update_snapshot_evidence(
                            db=db,
                            evidence_id=existing_event.evidence_id,
                            frame=frame,
                            plate_crop=plate_crop,
                            vehicle_crop=vehicle_crop,
                            event_type=event_type,
                            timestamp=now,
                            confidence=plate_confidence
                        )
                        if updated_ev:
                            cls._active_event_best_quality[lifecycle_key] = cand_quality
                            if existing_event.event_metadata:
                                ev_meta = existing_event.event_metadata.get('evidence', {})
                                ev_meta['snapshot_url'] = updated_ev.image_path
                                ev_meta['sha256'] = updated_ev.sha256
                                if updated_ev.plate_image_path:
                                    ev_meta['plate_image_url'] = updated_ev.plate_image_path
                                    ev_meta['plate_sha256'] = updated_ev.plate_sha256
                                existing_event.event_metadata['evidence'] = ev_meta
                                flag_modified(existing_event, 'event_metadata')
                    except Exception as e:
                        logger.debug(f"Failed to update general snapshot evidence: {e}")
                db.commit()
                return existing_event

        # 3. Debouncing / Cooldown check for re-triggering resolved events
        last_time = cls._cooldown_cache.get(lifecycle_key)
        if last_time and (now - _to_utc(last_time)).total_seconds() < settings.EVENT_COOLDOWN_SECONDS:
            return None

        cls._cooldown_cache[lifecycle_key] = now

        context = candidate.get('context', {})
        risk_score, severity, factors = cls.calculate_risk_score_and_severity(event_type, context)

        evidence = None
        if frame is not None or plate_crop is not None:
            try:
                evidence = EvidenceService.create_snapshot_evidence(
                    db=db,
                    frame=frame,
                    plate_crop=plate_crop,
                    vehicle_crop=vehicle_crop,
                    event_type=event_type,
                    timestamp=now
                )
            except Exception as e:
                logger.error(f"Failed to create evidence snapshot: {e}")

        event_id = str(uuid.uuid4())
        capture_status = "SUCCESS" if (evidence and (evidence.image_path or evidence.plate_image_path)) else ("FAILED" if (frame is not None or plate_crop is not None) else "UNAVAILABLE")

        meta = {
            "object": candidate.get('object'),
            "zone": candidate.get('zone'),
            "rule": candidate.get('rule', {"name": f"Rule: {event_type}"}),
            "context": context,
            "risk_factors": factors,
            "evidence": {
                "evidence_id": evidence.id if evidence else None,
                "snapshot_url": evidence.image_path if evidence else None,
                "plate_image_url": evidence.plate_image_path if evidence else None,
                "plate_number": plate_number,
                "confidence": plate_confidence,
                "capture_status": capture_status,
                "sha256": evidence.sha256 if evidence else None,
                "plate_sha256": evidence.plate_sha256 if evidence else None,
                "file_size_bytes": evidence.file_size_bytes if evidence else 0
            }
        }

        event = Event(
            id=event_id,
            camera_id=camera_id,
            event_type=event_type,
            severity=severity,
            risk_score=risk_score,
            timestamp=now,
            track_id=track_id,
            confidence=candidate.get('confidence', 0.85),
            event_metadata=meta,
            evidence_id=evidence.id if evidence else None,
            status="active"
        )

        db.add(event)
        db.commit()
        db.refresh(event)

        if evidence:
            evidence.event_id = event.id
            db.commit()

        # Generate Evidence Video Clip if buffered frames provided
        buffered_frames = candidate.get('buffered_frames')
        if buffered_frames and evidence:
            try:
                EvidenceService.create_video_clip_evidence(
                    db=db,
                    frames=buffered_frames,
                    fps=20.0,
                    evidence_id=evidence.id,
                    event_id=event.id,
                    event_type=event_type,
                    timestamp=now
                )
            except Exception as e:
                logger.error(f"Failed to create evidence video clip: {e}")

        # Automatically create persistent Incident record for investigation
        cam_obj = db.query(Camera).filter(Camera.id == camera_id).first()
        cam_name = cam_obj.name if cam_obj else camera_id
        cam_sector = cam_obj.sector if cam_obj else "Sector 01"
        cam_location = cam_obj.location if cam_obj else "Perimeter"

        obj_class = (candidate.get('object', {}).get('class_name') or 'Person').capitalize()
        conf_val = float(candidate.get('confidence', 0.85))

        incident = Incident(
            event_id=event.id,
            camera_id=camera_id,
            title=f"{event_type.replace('_', ' ').title()} - {cam_name}",
            type=event_type.replace('_', ' ').title(),
            severity=severity.lower(),
            status="unacknowledged",
            priority=1 if severity == "CRITICAL" else 2 if severity == "HIGH" else 3,
            detected_at=now,
            evidence_id=evidence.id if evidence else None,
            object_class=obj_class,
            confidence=conf_val
        )
        db.add(incident)
        db.commit()
        db.refresh(incident)

        # Append SHA-256 Audit Record
        audit_payload = {
            "event_id": event.id,
            "incident_id": incident.id,
            "camera_id": camera_id,
            "event_type": event_type,
            "severity": severity,
            "risk_score": risk_score,
            "timestamp": now.isoformat(),
            "sha256_evidence": evidence.sha256 if evidence else None
        }
        audit_rec = AuditService.append_event(db, event.id, event_type, audit_payload)

        event.previous_hash = audit_rec.previous_hash
        event.event_hash = audit_rec.record_hash
        db.commit()

        # Register in active lifecycle store
        cls._active_events[lifecycle_key] = event.id
        cls._active_event_last_seen[lifecycle_key] = now
        cls._active_event_best_quality[lifecycle_key] = cand_quality
        cls._cooldown_cache[lifecycle_key] = now

        if is_vehicle:
            cls._vehicle_sessions.setdefault(camera_id, []).append({
                "event_id": event.id,
                "incident_id": incident.id,
                "evidence_id": evidence.id if evidence else None,
                "track_id": track_id,
                "plate_number": plate_number,
                "bbox": bbox,
                "start_time": now,
                "last_seen": now,
                "best_quality": cand_quality,
                "event_type": event_type
            })

        # Broadcast via WebSocket (Both standard SURVEILLANCE_EVENT and alert.new schemas)
        ws_payload = {
            "type": "SURVEILLANCE_EVENT",
            "event": {
                "id": event.id,
                "event_id": event.id,
                "incident_id": incident.id,
                "camera_id": camera_id,
                "camera_name": cam_name,
                "sector": cam_sector,
                "event_type": event_type,
                "severity": severity,
                "risk_score": risk_score,
                "timestamp": now.isoformat(),
                "plate_number": plate_number,
                "plate_image_url": evidence.plate_image_path if evidence else None,
                "snapshot_url": evidence.image_path if evidence else None,
                "evidence_status": capture_status,
                "status": "active",
                "object": candidate.get('object'),
                "zone": candidate.get('zone'),
                "evidence": meta["evidence"]
            }
        }

        alert_data = {
            "id": event.id,
            "eventId": event.id,
            "incidentId": incident.id,
            "type": event_type.replace('_', ' ').title(),
            "event_type": event_type,
            "severity": severity.lower(),
            "cameraId": camera_id,
            "camera_id": camera_id,
            "cameraName": cam_name,
            "camera_name": cam_name,
            "location": cam_location,
            "sector": cam_sector,
            "timestamp": now.isoformat(),
            "confidence": round(conf_val * 100, 1) if conf_val <= 1.0 else conf_val,
            "objectClass": obj_class,
            "plateNumber": plate_number,
            "plate_number": plate_number,
            "plateImageUrl": evidence.plate_image_path if evidence else None,
            "plate_image_url": evidence.plate_image_path if evidence else None,
            "snapshotUrl": evidence.image_path if evidence else None,
            "snapshot_url": evidence.image_path if evidence else None,
            "evidenceStatus": capture_status,
            "evidence_status": capture_status,
            "status": "active",
            "summary": f"{event_type.replace('_', ' ').title()}{f' [{plate_number}]' if plate_number else ''} at {cam_name}",
            "boundingBoxes": []
        }

        ws_alert_payload = {
            "type": "alert.new",
            "payload": alert_data,
            "event": alert_data,
            "alert": alert_data
        }

        # Reliable WebSocket dispatch to all connected dashboard and operational rail clients
        cls.broadcast_sync(ws_payload)
        cls.broadcast_sync(ws_alert_payload)

        return event
