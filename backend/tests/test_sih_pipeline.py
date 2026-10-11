import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import cv2
import numpy as np
import pytest
from datetime import datetime
import uuid
from fastapi.testclient import TestClient

from app.main import app
from app.db.database import SessionLocal, init_db_schema
from app.db.models.models import Camera, Zone, Event, Incident, Evidence, AuditRecord
from app.services.evidence_service import EvidenceService
from app.services.audit_service import AuditService
from app.services.event_service import EventService
from app.core.config import settings

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_test_environment():
    init_db_schema()
    yield
    # Clean up test-specific entities and re-sync persistent fleet cameras
    db = SessionLocal()
    try:
        from app.db.models.models import Detection, Event, Incident, IncidentNote, Evidence, AuditRecord, Camera
        from app.api.v1.test_streams import sync_all_uploaded_videos_to_cameras
        db.query(IncidentNote).delete()
        db.query(Incident).filter(Incident.camera_id.in_(["CAM-E2E-01", "CAM-TEST-01"])).delete()
        db.query(Detection).filter(Detection.camera_id.in_(["CAM-E2E-01", "CAM-TEST-01"])).delete()
        db.query(Event).filter(Event.camera_id.in_(["CAM-E2E-01", "CAM-TEST-01"])).delete()
        db.query(Camera).filter(Camera.id.in_(["CAM-E2E-01", "CAM-TEST-01"])).delete()
        db.commit()
        # Ensure fleet cameras SIM-CAM-01 through 04 remain available
        sync_all_uploaded_videos_to_cameras(db)
    except Exception:
        pass
    finally:
        db.close()


def create_synthetic_mp4(filepath: str, num_frames=30, width=320, height=240):
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(filepath, fourcc, 15.0, (width, height))
    for i in range(num_frames):
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        # Draw moving rectangle (simulated person/target moving across boundary)
        x = int(10 + i * (width - 40) / num_frames)
        y = int(height / 2)
        cv2.rectangle(frame, (x, y - 20), (x + 30, y + 20), (255, 255, 255), -1)
        out.write(frame)
    out.release()
    return filepath

def test_system_health_endpoint():
    """Verify GET /api/v1/system/health returns real system health metrics."""
    response = client.get("/api/v1/system/health")
    assert response.status_code == 200
    data = response.json()
    assert data["database"] == "healthy"
    assert "storageUsedGb" in data
    assert "storageTotalGb" in data
    assert "videoIngestion" in data
    assert "cameraNetworkPercent" in data

def test_real_video_upload_and_ingestion(tmp_path):
    """Verify video upload endpoint saves real video file and registers stream."""
    test_video_path = str(tmp_path / "test_feed.mp4")
    create_synthetic_mp4(test_video_path, num_frames=20)

    with open(test_video_path, "rb") as f:
        response = client.post(
            "/api/v1/streams/upload",
            files={"file": ("test_feed.mp4", f, "video/mp4")},
            data={"camera_name": "E2E Border Post Camera", "sector": "SECTOR-TEST"}
        )
    assert response.status_code == 200
    data = response.json()
    assert "camera_id" in data
    assert "video_path" in data
    assert os.path.exists(data["video_path"])

def test_event_and_incident_generation_with_evidence():
    """Verify end-to-end event generation, automated incident creation, evidence hashing and video clip creation."""
    db = SessionLocal()
    try:
        # Create test camera
        cam = db.query(Camera).filter(Camera.id == "CAM-E2E-01").first()
        if not cam:
            cam = Camera(
                id="CAM-E2E-01",
                name="Test Perimeter Cam 01",
                stream_url="test.mp4",
                source_type="file",
                status="online",
                sector="SECTOR-BRAVO",
                location="Perimeter Post B-12"
            )
            db.add(cam)
            db.commit()

        # Create buffered frames simulating intrusion with simulated low-light background
        frames = []
        for _ in range(15):
            f = np.full((240, 320, 3), 45, dtype=np.uint8)
            cv2.circle(f, (160, 120), 20, (0, 255, 0), -1)
            frames.append(f)

        candidate = {
            "camera_id": "CAM-E2E-01",
            "event_type": "INTRUSION",
            "track_id": 9991,
            "confidence": 0.94,
            "frame": frames[-1],
            "buffered_frames": frames,
            "object": {
                "class_name": "person",
                "object_id": 9991,
                "confidence": 0.94,
                "bounding_box": [140.0, 100.0, 180.0, 140.0]
            },
            "zone": {
                "zone_id": "ZONE-TEST-01",
                "name": "Restricted Zero Line"
            },
            "context": {
                "is_night": False,
                "low_light": False
            }
        }

        # Process candidate event through EventService
        event = EventService.process_candidate_event(db, candidate)
        assert event is not None
        assert event.event_type == "INTRUSION"
        assert event.severity in ["MEDIUM", "HIGH", "CRITICAL"]

        # Verify corresponding Incident was automatically created
        incident = db.query(Incident).filter(Incident.event_id == event.id).first()
        assert incident is not None
        assert incident.camera_id == "CAM-E2E-01"
        assert incident.status in ["unacknowledged", "active", "under_review"]

        # Verify evidence was created and hashed
        evidence = db.query(Evidence).filter(Evidence.id == event.evidence_id).first()
        assert evidence is not None
        assert len(evidence.sha256) == 64  # Valid SHA-256 hex string
        assert evidence.video_path is not None
        clip_name = os.path.basename(evidence.video_path)
        assert os.path.exists(os.path.join(settings.resolved_storage_dir, "evidence", clip_name)) or os.path.exists(evidence.video_path.lstrip("/"))

        # Verify cryptographic integrity of evidence on disk
        verify_report = EvidenceService.verify_evidence(db, evidence.id)
        assert verify_report["valid"] is True
        assert verify_report["computed_sha256"] == evidence.sha256

    finally:
        try:
            # Clean up test artifacts so test run doesn't leave dummy evidence files in production storage
            if 'event' in locals() and event:
                ev_id = event.evidence_id
                db.query(Incident).filter(Incident.event_id == event.id).delete()
                db.query(Event).filter(Event.id == event.id).delete()
                if ev_id:
                    ev_rec = db.query(Evidence).filter(Evidence.id == ev_id).first()
                    if ev_rec:
                        if ev_rec.image_path:
                            fp = os.path.join(settings.resolved_storage_dir, "evidence", os.path.basename(ev_rec.image_path))
                            if os.path.exists(fp): os.remove(fp)
                        if ev_rec.video_path:
                            fp = os.path.join(settings.resolved_storage_dir, "evidence", os.path.basename(ev_rec.video_path))
                            if os.path.exists(fp): os.remove(fp)
                        db.delete(ev_rec)
                cam_rec = db.query(Camera).filter(Camera.id == "CAM-E2E-01").first()
                if cam_rec:
                    db.delete(cam_rec)
                db.commit()
        except Exception:
            pass
        db.close()


def test_incident_lifecycle_and_notes():
    """Verify incident transitions: acknowledge -> add notes -> escalate -> resolve."""
    # Fetch existing incident or trigger one
    response = client.get("/api/v1/incidents")
    assert response.status_code == 200
    res_data = response.json()
    incidents = res_data if isinstance(res_data, list) else res_data.get("incidents", [])
    
    if len(incidents) == 0:
        db = SessionLocal()
        try:
            inc = Incident(
                id=str(uuid.uuid4()),
                title="Test Perimeter Alert",
                type="Perimeter Intrusion",
                camera_id="SIM-CAM-01",
                severity="critical",
                status="unacknowledged",
                priority=2,
                detected_at=datetime.utcnow()
            )
            db.add(inc)
            db.commit()
            incident_id = inc.id
        finally:
            db.close()
    else:
        incident_id = incidents[0]["id"]



    # 1. Acknowledge Incident
    ack_res = client.patch(
        f"/api/v1/incidents/{incident_id}/acknowledge",
        json={"actor": "Officer Sharma (OP-42)"}
    )
    assert ack_res.status_code == 200
    assert ack_res.json()["status"] == "under_review"

    # 2. Add Investigation Note
    note_res = client.post(
        f"/api/v1/incidents/{incident_id}/notes",
        json={"text": "Visual confirmation: target moving near perimeter marker 14.", "author": "Officer Sharma"}
    )
    assert note_res.status_code in [200, 201]
    assert note_res.json()["text"] == "Visual confirmation: target moving near perimeter marker 14."

    # 3. Escalate Incident to QRT
    esc_res = client.patch(
        f"/api/v1/incidents/{incident_id}/escalate",
        json={"actor": "Commander Singh", "reason": "Immediate perimeter intercept required."}
    )
    assert esc_res.status_code == 200
    assert esc_res.json()["status"] == "escalated"
    assert esc_res.json()["priority"] in [2, 3]


    # 4. Resolve Incident
    res_res = client.patch(
        f"/api/v1/incidents/{incident_id}/resolve",
        json={"actor": "Commander Singh", "resolutionSummary": "Perimeter secured by sector patrol team."}
    )
    assert res_res.status_code == 200
    assert res_res.json()["status"] == "resolved"

def test_audit_cryptographic_verification():
    """Verify full SHA-256 audit ledger verification via API."""
    response = client.get("/api/v1/audit/verify")
    assert response.status_code == 200
    report = response.json()
    assert report["valid"] is True
    assert report["records_checked"] > 0
    assert len(report["errors"]) == 0
