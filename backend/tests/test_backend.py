import sys
import os
import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.core.config import settings
from app.db.database import Base, engine, SessionLocal
from app.db.models.models import Camera, Detection, Event, Evidence, Watchlist, AuditRecord
from app.ai.zones import ZoneChecker
from app.ai.behaviour import LoiteringDetector
from app.ai.night_detection import NightMovementDetector
from app.ai.pipeline import AIPipeline
from app.services.audit_service import AuditService

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Clear tables for test isolation
    db.query(Detection).delete()
    db.query(Event).delete()
    db.query(Evidence).delete()
    db.query(Watchlist).delete()
    db.query(AuditRecord).delete()
    db.query(Camera).delete()
    db.commit()
    db.close()
    yield

def test_data_integrity_rule_empty_system():
    """Verify Absolute Data Integrity Rule: Fresh system returns empty collections."""
    resp = client.get("/api/v1/cameras")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cameras"] == []
    assert data["total"] == 0

    resp_events = client.get("/api/v1/events")
    assert resp_events.status_code == 200
    data_events = resp_events.json()
    assert data_events["events"] == []
    assert data_events["total"] == 0

    resp_evidence = client.get("/api/v1/evidence")
    assert resp_evidence.status_code == 200
    assert resp_evidence.json() == []

    resp_watchlist = client.get("/api/v1/watchlist")
    assert resp_watchlist.status_code == 200
    assert resp_watchlist.json() == []

def test_audit_chain_verification():
    """Verify SHA-256 audit chain verification logic."""
    db = SessionLocal()
    report = AuditService.verify_chain(db)
    assert report["valid"] is True
    assert report["errors"] == []
    db.close()

def test_zone_point_in_polygon():
    """Verify point-in-polygon ray casting geometry logic."""
    polygon = [[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]]
    point_inside = (50.0, 50.0)
    point_outside = (150.0, 150.0)

    assert ZoneChecker.is_point_in_polygon(point_inside, polygon) is True
    assert ZoneChecker.is_point_in_polygon(point_outside, polygon) is False

def test_camera_crud_real():
    """Verify creating and deleting a real camera."""
    payload = {
        "name": "BOP Sector 07 Cam",
        "stream_url": "rtsp://192.168.1.100/stream1",
        "source_type": "rtsp",
        "sector": "Sector 07"
    }
    res = client.post("/api/v1/cameras", json=payload)
    assert res.status_code == 201
    created = res.json()
    assert created["name"] == "BOP Sector 07 Cam"
    cam_id = created["id"]

    # Retrieve
    get_res = client.get(f"/api/v1/cameras/{cam_id}")
    assert get_res.status_code == 200

    # Delete
    del_res = client.delete(f"/api/v1/cameras/{cam_id}")
    assert del_res.status_code == 200

def test_local_camera_devtools_feature_flag():
    """Verify devtools endpoints behave according to ENABLE_LOCAL_CAMERA_TESTING feature flag."""
    # 1. Feature Flag OFF (default)
    settings.ENABLE_LOCAL_CAMERA_TESTING = False
    res_off = client.get("/api/v1/devtools/local-cameras")
    assert res_off.status_code == 404

    # 2. Feature Flag ON
    settings.ENABLE_LOCAL_CAMERA_TESTING = True
    res_on = client.get("/api/v1/devtools/local-cameras")
    assert res_on.status_code == 200
    data = res_on.json()
    assert "devices" in data
    assert "total" in data

    # Reset feature flag
    settings.ENABLE_LOCAL_CAMERA_TESTING = True

# --- Fine-Tuned Security & Behavioral Event Engine Unit Tests ---

def test_zone_hysteresis_and_state_machine():
    """
    Verify Zone Engine state machine (OUTSIDE -> POSSIBLE_ENTRY -> CONFIRMED_ENTRY -> INSIDE -> EXITED)
    and hysteresis confirmation frames (ZONE_CONFIRMATION_FRAMES=3).
    """
    checker = ZoneChecker(confirmation_frames=3, ttl_seconds=3.0)
    polygon = [[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]]
    bbox_inside = [40.0, 40.0, 60.0, 60.0]   # Bottom-center: (50.0, 60.0) inside
    bbox_outside = [140.0, 140.0, 160.0, 160.0]
    now = datetime.now(timezone.utc)

    # Frame 1 inside: POSSIBLE_ENTRY
    res1 = checker.check_zone_transitions("cam1", "z1", "Restricted Zone", polygon, 1, bbox_inside, timestamp=now)
    assert res1["state"] == "POSSIBLE_ENTRY"
    assert res1["transition"] == "NONE"
    assert res1["is_inside"] is False

    # Frame 2 inside: POSSIBLE_ENTRY
    res2 = checker.check_zone_transitions("cam1", "z1", "Restricted Zone", polygon, 1, bbox_inside, timestamp=now)
    assert res2["state"] == "POSSIBLE_ENTRY"
    assert res2["transition"] == "NONE"

    # Frame 3 inside: CONFIRMED_ENTRY -> Emits transition ENTERED!
    res3 = checker.check_zone_transitions("cam1", "z1", "Restricted Zone", polygon, 1, bbox_inside, timestamp=now)
    assert res3["state"] == "CONFIRMED_ENTRY"
    assert res3["transition"] == "ENTERED"
    assert res3["is_inside"] is True

    # Frame 4 inside: INSIDE -> Transition NONE (No duplicate alert!)
    res4 = checker.check_zone_transitions("cam1", "z1", "Restricted Zone", polygon, 1, bbox_inside, timestamp=now)
    assert res4["state"] == "INSIDE"
    assert res4["transition"] == "NONE"
    assert res4["is_inside"] is True

    # Frame 5 outside: EXITED -> Transition EXITED
    res5 = checker.check_zone_transitions("cam1", "z1", "Restricted Zone", polygon, 1, bbox_outside, timestamp=now)
    assert res5["state"] == "OUTSIDE"
    assert res5["transition"] == "EXITED"
    assert res5["is_inside"] is False

def test_track_state_ttl_retention():
    """Verify track state is retained during brief tracker loss (< TRACK_STATE_TTL_SECONDS)."""
    checker = ZoneChecker(confirmation_frames=1, ttl_seconds=3.0)
    polygon = [[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]]
    bbox = [40.0, 40.0, 60.0, 60.0]
    t0 = datetime.now(timezone.utc)

    # Establish track 10 inside
    checker.check_zone_transitions("cam1", "z1", "Zone A", polygon, 10, bbox, timestamp=t0)
    assert ( "cam1", "z1", 10 ) in checker.track_states

    # Track 10 missing for 1 second (t0 + 1s)
    t1 = t0 + timedelta(seconds=1.0)
    checker.cleanup_stale_tracks(active_track_ids=set(), current_time=t1)
    assert ( "cam1", "z1", 10 ) in checker.track_states, "Track state should be retained within TTL"

    # Track 10 missing for 4 seconds (t0 + 4s > 3s TTL)
    t4 = t0 + timedelta(seconds=4.0)
    checker.cleanup_stale_tracks(active_track_ids=set(), current_time=t4)
    assert ( "cam1", "z1", 10 ) not in checker.track_states, "Track state should expire after TTL"

def test_loitering_state_machine_and_reset():
    """
    Verify Loitering state machine:
    Starts timer on entry, triggers event ONCE when threshold exceeded, and resets on zone exit.
    """
    detector = LoiteringDetector(threshold_seconds=10.0)
    t0 = datetime.now(timezone.utc)

    # Entry at t0
    res0 = detector.update_track_presence("cam1", "z1", 5, is_inside=True, current_time=t0)
    assert res0 is None

    # At t=5s (below threshold)
    t5 = t0 + timedelta(seconds=5.0)
    res5 = detector.update_track_presence("cam1", "z1", 5, is_inside=True, current_time=t5)
    assert res5 is None

    # At t=10.5s (threshold exceeded) -> Emits LOITERING event!
    t10 = t0 + timedelta(seconds=10.5)
    res10 = detector.update_track_presence("cam1", "z1", 5, is_inside=True, current_time=t10)
    assert res10 is not None
    assert res10["event_type"] == "LOITERING"
    assert res10["duration_seconds"] == 10.5

    # At t=11s -> Returns None (No duplicate per-frame alert!)
    t11 = t0 + timedelta(seconds=11.0)
    res11 = detector.update_track_presence("cam1", "z1", 5, is_inside=True, current_time=t11)
    assert res11 is None

    # Exit zone -> Timer resets
    detector.update_track_presence("cam1", "z1", 5, is_inside=False, current_time=t11)
    assert ("cam1", "z1", 5) not in detector.zone_entry_timestamps

def test_night_movement_midnight_crossing():
    """Verify night window evaluation with midnight crossing (20:00 to 06:00)."""
    detector = NightMovementDetector(start_time_str="20:00", end_time_str="06:00")

    # 22:30 (Night)
    dt_night_1 = datetime(2026, 9, 22, 22, 30, 0)
    assert detector.is_night_time(dt_night_1) is True

    # 03:15 next morning (Night)
    dt_night_2 = datetime(2026, 9, 23, 3, 15, 0)
    assert detector.is_night_time(dt_night_2) is True

    # 14:00 (Daytime)
    dt_day = datetime(2026, 9, 22, 14, 0, 0)
    assert detector.is_night_time(dt_day) is False

def test_rolling_window_luminance_stability():
    """Verify rolling window luminance stability resists single-frame auto-exposure/glitch false positives."""
    import numpy as np

    detector = NightMovementDetector(
        start_time_str="20:00",
        end_time_str="06:00",
        low_light_threshold=80.0,
        window_size=5
    )

    dt_day = datetime(2026, 9, 22, 12, 0, 0) # Daytime

    bright_frame = np.full((100, 100, 3), 150, dtype=np.uint8)
    dark_frame = np.full((100, 100, 3), 20, dtype=np.uint8)

    # 4 Bright frames
    for _ in range(4):
        info = detector.analyze(dt_day, bright_frame, camera_id="c1")
        assert info["low_light"] is False

    # 1 Single dark frame glitch -> Rolling median stays bright!
    glitch_info = detector.analyze(dt_day, dark_frame, camera_id="c1")
    assert glitch_info["low_light"] is False, "Single dark glitch frame should be suppressed by rolling median"

    # Sustained dark frames (4 more dark frames) -> Rolling median drops below threshold
    for _ in range(4):
        sustained_info = detector.analyze(dt_day, dark_frame, camera_id="c1")

    assert sustained_info["low_light"] is True, "Sustained low luminance must trigger low-light condition"

def test_absolute_data_rule_no_fake_events():
    """Verify Absolute Data Rule: Null frame input returns 0 detections and 0 candidate events."""
    pipeline = AIPipeline()
    now = datetime.now(timezone.utc)
    res = pipeline.process_frame(
        frame=None,
        camera_id="cam_test",
        timestamp=now,
        frame_number=1,
        zones=[],
        watchlist_values=[]
    )
    assert res["detections"] == []
    assert res["candidate_events"] == []
