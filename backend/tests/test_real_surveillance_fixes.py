import pytest
import numpy as np
import cv2
from datetime import datetime, timezone, timedelta
from app.ai.tracker import ByteTracker
from app.ai.reid import GlobalIdentityManager, PersonReIDExtractor
from app.ai.anpr import ANPREngine
from app.ai.night_detection import NightMovementDetector
from app.ai.pipeline import AIPipeline
from app.ai.detector import YOLODetector

# =====================================================================
# Scenario 1: Same Person Tracking Continuity (Issue 1A)
# =====================================================================
def test_scenario_1_same_person_tracking_continuity():
    """
    Verifies that a person moving across frames retains their track ID,
    even when occluded for 1-2 frames.
    """
    tracker = ByteTracker(max_age=15, high_threshold=0.4)

    # Frame 1: Person appears
    det_f1 = [{"class_name": "person", "confidence": 0.88, "bbox": [100.0, 150.0, 160.0, 280.0]}]
    out1 = tracker.update(det_f1)
    assert len(out1) == 1
    track_id_initial = out1[0]["track_id"]

    # Frame 2: Person moves smoothly
    det_f2 = [{"class_name": "person", "confidence": 0.89, "bbox": [106.0, 152.0, 166.0, 282.0]}]
    out2 = tracker.update(det_f2)
    assert len(out2) == 1
    assert out2[0]["track_id"] == track_id_initial, "Track ID must remain identical on consecutive frame"

    # Frames 3 & 4: Occlusion (Detector misses detection for 2 frames)
    # Anti-flicker coasting maintains confirmed track continuity with is_coasting=True
    out3 = tracker.update([])
    assert len(out3) == 1 and out3[0]["track_id"] == track_id_initial and out3[0]["is_coasting"] is True
    out4 = tracker.update([])
    assert len(out4) == 1 and out4[0]["track_id"] == track_id_initial and out4[0]["is_coasting"] is True

    # Frame 5: Person reappears near Kalman-predicted location
    det_f5 = [{"class_name": "person", "confidence": 0.84, "bbox": [124.0, 158.0, 184.0, 288.0]}]
    out5 = tracker.update(det_f5)
    assert len(out5) == 1
    assert out5[0]["track_id"] == track_id_initial, "Track ID must persist through 2-frame occlusion"
    assert out5[0]["is_coasting"] is False, "Active detection clears coasting state"


# =====================================================================
# Scenario 2: Cross-Camera Person Re-ID (Issue 1B)
# =====================================================================
def test_scenario_2_cross_camera_person_reid():
    """
    Verifies that:
    1. Local Track IDs are camera-specific (e.g. A-12 vs B-37).
    2. Global Person IDs are unified across cameras (P-0001 == P-0001).
    3. Re-ID similarity score is truthfully computed from appearance features.
    """
    manager = GlobalIdentityManager(similarity_threshold=0.84)
    manager.reset()

    # Create realistic test person crop (textures and colors)
    person_crop = np.zeros((160, 80, 3), dtype=np.uint8)
    person_crop[:80, :] = [180, 70, 40]    # Blue jacket upper body
    person_crop[80:, :] = [30, 30, 35]     # Dark trousers lower body

    # Camera Alpha records local track 12
    gid_alpha, sim_alpha, is_new = manager.identify_or_register("CAM_ALPHA", 12, person_crop)
    assert gid_alpha.startswith("P-"), "Global ID must follow P-XXXX format"
    assert is_new is True, "First observation must register new identity"

    # Same person moves to Camera Bravo (slightly perturbed perspective)
    person_crop_bravo = cv2.GaussianBlur(person_crop, (3, 3), 0)
    gid_bravo, sim_bravo, is_new_bravo = manager.identify_or_register("CAM_BRAVO", 37, person_crop_bravo)

    assert is_new_bravo is False, "Camera Bravo must match existing identity"
    assert gid_bravo == gid_alpha, f"Global ID must match across cameras: {gid_bravo} vs {gid_alpha}"
    assert sim_bravo >= 0.84, f"Re-ID similarity must meet threshold: {sim_bravo}"

    # Summary confirms sightings on both cameras
    summary = manager.get_gallery_summary()
    matched_profile = next(p for p in summary if p["global_id"] == gid_alpha)
    assert "CAM_ALPHA" in matched_profile["cameras"]
    assert "CAM_BRAVO" in matched_profile["cameras"]


# =====================================================================
# Scenario 3: Real License Plate ANPR (Issue 2)
# =====================================================================
def test_scenario_3_anpr_pipeline_with_temporal_voting():
    """
    Verifies full ANPR pipeline:
    - Vehicle with real plate -> crops, OCR, temporal voting -> confident plate number.
    - Vehicle with no plate -> returns UNKNOWN / NOT_DETECTED.
    """
    engine = ANPREngine("models/license_plate_yolov8n.pt")

    # 1. Vehicle with real plate
    vehicle_img = np.zeros((240, 380, 3), dtype=np.uint8)
    vehicle_img[:] = [80, 80, 80]
    # Draw plate area
    cv2.rectangle(vehicle_img, (130, 140), (250, 185), (250, 250, 250), -1)
    cv2.rectangle(vehicle_img, (130, 140), (250, 185), (0, 0, 0), 2)
    cv2.putText(vehicle_img, "DL04CA2020", (135, 172), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (0, 0, 0), 2)

    # Frame 1 for Track 10
    res_f1 = engine.process_vehicle_crop(vehicle_img, track_id=10)
    assert res_f1 is not None

    if engine.paddle_ocr is not None or engine.ocr_reader is not None:
        assert "DL04" in res_f1["plate_number"] or "2020" in res_f1["plate_number"]
        # Frame 2 for Track 10 (temporal voting lock)
        res_f2 = engine.process_vehicle_crop(vehicle_img, track_id=10)
        assert res_f2["plate_number"] == res_f1["plate_number"]
        assert res_f2["status"] in ["CONFIDENT", "TRACK_VOTED"]
    else:
        assert res_f1["plate_number"] == "UNKNOWN"

    # 2. Vehicle without plate
    vehicle_no_plate = np.zeros((200, 300, 3), dtype=np.uint8)
    vehicle_no_plate[:] = [120, 120, 120]
    res_no_plate = engine.process_vehicle_crop(vehicle_no_plate, track_id=20)
    assert res_no_plate["plate_number"] == "UNKNOWN"
    assert res_no_plate["status"] == "NOT_DETECTED"


# =====================================================================
# Scenario 4: Night Movement Tests A–E (Issue 3)
# =====================================================================
def test_scenario_4a_daytime_video_at_night_wallclock():
    """Test 4A: Daytime video tested at night (wall clock) does NOT trigger night mode."""
    detector = NightMovementDetector()
    # Daytime frame: bright scene
    day_frame = np.full((100, 100, 3), 160, dtype=np.uint8)
    # Clock set to 02:00 AM (midnight)
    night_clock = datetime(2026, 1, 1, 2, 0, 0, tzinfo=timezone.utc)

    analysis = detector.analyze(night_clock, day_frame, camera_id="CAM_1", frame_number=20)
    assert analysis["is_time_night"] is True, "Wall clock is nighttime"
    assert analysis["visual_darkness"] is False, "Visual scene is daylight"
    assert analysis["is_night"] is False, "is_night must be FALSE for daylight video regardless of server clock"


def test_scenario_4b_startup_grace_period():
    """Test 4B: First 15 frames of video playback must be in grace period."""
    detector = NightMovementDetector()
    dark_frame = np.full((100, 100, 3), 20, dtype=np.uint8)

    # Frame 5 (startup)
    analysis_5 = detector.analyze(datetime.now(timezone.utc), dark_frame, frame_number=5)
    assert analysis_5["in_grace_period"] is True, "Frame 5 must be in grace period"

    # Frame 16 (post startup)
    analysis_16 = detector.analyze(datetime.now(timezone.utc), dark_frame, frame_number=16)
    assert analysis_16["in_grace_period"] is False, "Frame 16 must be out of grace period"


def test_scenario_4c_static_object_in_dark_scene():
    """Test 4C: Static object in dark scene does NOT trigger night movement."""
    pipeline = AIPipeline()
    dark_frame = np.full((300, 400, 3), 15, dtype=np.uint8)
    t = datetime.now(timezone.utc)

    # Simulate 20 frames where detector spots static person at same coordinates
    alerts_fired = []
    for f in range(20):
        # Override detector detect method for controlled test
        pipeline.detector.detect = lambda frame: [{
            "class_name": "person",
            "confidence": 0.85,
            "bbox": [100.0, 100.0, 150.0, 200.0]
        }]
        res = pipeline.process_frame(dark_frame, "CAM_1", t, frame_number=f, zones=[], watchlist_values=[])
        for event in res["candidate_events"]:
            if event["event_type"] == "NIGHT_MOVEMENT":
                alerts_fired.append(event)

    assert len(alerts_fired) == 0, "Static object must NEVER trigger NIGHT_MOVEMENT alert"


def test_scenario_4d_moving_object_in_dark_scene():
    """Test 4D: Object with displacement >= 25px after frame 15 triggers night movement."""
    pipeline = AIPipeline()
    dark_frame = np.full((300, 400, 3), 15, dtype=np.uint8)
    t = datetime.now(timezone.utc)

    alerts_fired = []
    # Feed 15 static frames (startup grace)
    for f in range(15):
        pipeline.detector.detect = lambda frame: [{
            "class_name": "person",
            "confidence": 0.85,
            "bbox": [100.0, 100.0, 150.0, 200.0]
        }]
        pipeline.process_frame(dark_frame, "CAM_1", t, frame_number=f, zones=[], watchlist_values=[])

    # Now person moves 60 pixels across 5 frames
    for f in range(15, 22):
        shift = (f - 14) * 12.0  # 12px per frame = 84px total shift
        pipeline.detector.detect = lambda frame, s=shift: [{
            "class_name": "person",
            "confidence": 0.85,
            "bbox": [100.0 + s, 100.0, 150.0 + s, 200.0]
        }]
        res = pipeline.process_frame(dark_frame, "CAM_1", t, frame_number=f, zones=[], watchlist_values=[])
        for event in res["candidate_events"]:
            if event["event_type"] == "NIGHT_MOVEMENT":
                alerts_fired.append(event)

    assert len(alerts_fired) >= 1, "Moving person in dark scene must trigger NIGHT_MOVEMENT"


def test_scenario_4e_night_movement_cooldown():
    """Test 4E: Alert debouncing prevents continuous alerts for the same track."""
    pipeline = AIPipeline()
    dark_frame = np.full((300, 400, 3), 15, dtype=np.uint8)
    t = datetime.now(timezone.utc)

    # Run beyond grace period with moving person
    alerts = []
    for f in range(25):
        s = f * 10.0
        pipeline.detector.detect = lambda frame, shift=s: [{
            "class_name": "person",
            "confidence": 0.85,
            "bbox": [50.0 + shift, 50.0, 100.0 + shift, 150.0]
        }]
        res = pipeline.process_frame(dark_frame, "CAM_1", t + timedelta(milliseconds=f * 100), frame_number=f, zones=[], watchlist_values=[])
        for event in res["candidate_events"]:
            if event["event_type"] == "NIGHT_MOVEMENT":
                alerts.append(event)

    # Within 2.5 seconds total video time, cooldown (10s) must allow at most 1 alert
    assert len(alerts) == 1, f"Cooldown must restrict alerts to 1, got {len(alerts)}"


# =====================================================================
# Scenario 5: Multi-Vehicle & Two-Wheelers (Issue 4)
# =====================================================================
def test_scenario_5_multi_vehicle_and_two_wheelers():
    """
    Verifies that all vehicles including two-wheelers (motorcycle, bicycle)
    are detected and classified without dropping or truncating.
    """
    pipeline = AIPipeline()
    frame = np.full((400, 600, 3), 100, dtype=np.uint8)
    t = datetime.now(timezone.utc)

    # 4 distinct vehicles simultaneously
    pipeline.detector.detect = lambda f: [
        {"class_name": "car", "category": "vehicle", "confidence": 0.91, "bbox": [10.0, 20.0, 100.0, 110.0], "class_id": 2},
        {"class_name": "truck", "category": "vehicle", "confidence": 0.88, "bbox": [120.0, 20.0, 240.0, 140.0], "class_id": 7},
        {"class_name": "motorcycle", "category": "two_wheeler", "confidence": 0.84, "bbox": [260.0, 30.0, 320.0, 100.0], "class_id": 3},
        {"class_name": "bicycle", "category": "two_wheeler", "confidence": 0.82, "bbox": [340.0, 30.0, 390.0, 95.0], "class_id": 1},
    ]

    res = pipeline.process_frame(frame, "CAM_1", t, frame_number=1, zones=[], watchlist_values=[])
    dets = res["detections"]
    assert len(dets) == 4, f"All 4 vehicles must be tracked, got {len(dets)}"
    class_names = [d["class_name"] for d in dets]
    assert "car" in class_names
    assert "truck" in class_names
    assert "motorcycle" in class_names
    assert "bicycle" in class_names


# =====================================================================
# Scenario 6: Non-Standard Transport (Bullock Cart / Non-COCO)
# =====================================================================
def test_scenario_6_non_standard_transport_truthful_classification():
    """
    Verifies that non-COCO non-standard transport (e.g. animal / cart)
    truthfully reports MODEL-LIMITED without fabricating fake classifications.
    """
    detector = YOLODetector()
    frame = np.full((300, 300, 3), 120, dtype=np.uint8)

    # Mock ultralytics result returning a cow / draft animal
    class MockBox:
        def __init__(self, cls_id, conf, xyxy):
            self.cls = [type('Tensor', (), {'item': lambda s: cls_id})()]
            self.conf = [type('Tensor', (), {'item': lambda s: conf})()]
            self.xyxy = [type('Tensor', (), {'tolist': lambda s: xyxy})()]

    class MockResults:
        def __init__(self):
            self.boxes = [MockBox(19, 0.78, [40.0, 50.0, 180.0, 200.0])]

    detector.model = type('MockYOLO', (), {
        'predict': lambda *args, **kwargs: [MockResults()],
        'names': {19: 'cow'}
    })()

    dets = detector.detect(frame)
    assert len(dets) == 1
    assert dets[0]["class_name"] == "animal"
    assert "MODEL-LIMITED" in dets[0]["classification_note"]
    assert dets[0]["category"] == "non_standard_transport"
