import os
import time
import pytest
import numpy as np
import cv2
from app.core.config import settings
from app.db.database import SessionLocal
from app.db.models.models import Camera
from app.workers.video_worker import worker_manager
from app.api.v1.test_streams import (
    scan_project_videos,
    sync_all_uploaded_videos_to_cameras,
    start_test_streaming,
    stop_test_streaming,
    StartTestStreamRequest,
    StopTestStreamRequest,
)
from app.services.event_service import EventService

@pytest.fixture(autouse=True)
def ensure_test_videos():
    uploads_dir = os.path.join(settings.resolved_storage_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    created_files = []
    current_videos = scan_project_videos()
    needed = 4 - len(current_videos)
    if needed > 0:
        for i in range(needed):
            file_name = f"synth_test_video_{i+1}.mp4"
            file_path = os.path.join(uploads_dir, file_name)
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(file_path, fourcc, 10.0, (320, 240))
            for _ in range(25):
                frame = np.random.randint(0, 256, (240, 320, 3), dtype=np.uint8)
                out.write(frame)
            out.release()
            created_files.append(file_path)
    yield
    for f in created_files:
        if os.path.exists(f):
            try:
                os.remove(f)
            except OSError:
                pass

def test_four_simulated_cameras_independent_streaming():
    """
    Verifies that all 4 simulated cameras initialize, stream simultaneously,
    produce valid telemetry, and have independent video sources.
    """
    db = SessionLocal()
    try:
        # 1. Discover uploaded videos
        videos = scan_project_videos()
        assert len(videos) >= 4, f"Expected at least 4 test videos in storage/uploads, found {len(videos)}"

        # 2. Sync cameras 1-to-1
        fleet = sync_all_uploaded_videos_to_cameras(db)
        assert len(fleet) >= 4

        # 3. Start all test streams
        start_res = start_test_streaming(StartTestStreamRequest(all=True, loop=True), db)
        assert start_res["is_streaming"] is True
        assert start_res["active_count"] >= 4

        # 4. Confirm workers are running independently and producing frames
        time.sleep(1.0)
        camera_ids = ["SIM-CAM-01", "SIM-CAM-02", "SIM-CAM-03", "SIM-CAM-04"]
        active_video_sources = set()

        for c_id in camera_ids:
            assert worker_manager.is_running(c_id), f"Camera {c_id} should be running"
            worker = worker_manager.get_worker(c_id)
            assert worker is not None
            assert worker.status == "ONLINE"
            assert worker.is_alive()
            assert worker.stream_url not in active_video_sources, f"Duplicate video source detected on {c_id}"
            active_video_sources.add(worker.stream_url)

            # Check telemetry validity
            telem = worker_manager.get_telemetry(c_id)
            assert telem["status"] == "ONLINE"
            assert telem["fps"] is not None and telem["fps"] > 0
            assert telem["resolution"] is not None and "x" in telem["resolution"]
            assert telem["frames_processed"] > 0

            # Check latest annotated frame exists
            frame = worker_manager.get_latest_frame(c_id)
            assert frame is not None and frame.size > 0

        # 5. Verify telemetry snapshot
        snap = EventService.get_telemetry_snapshot()
        assert snap["type"] == "CAMERA_HEARTBEAT"
        assert snap["active_count"] >= 4
        snap_cam_ids = {c["camera_id"] for c in snap["cameras"]}
        for c_id in camera_ids:
            assert c_id in snap_cam_ids

        # 6. Verify single camera stop does NOT affect other cameras
        stop_test_streaming(StopTestStreamRequest(camera_id="SIM-CAM-01"), db)
        assert not worker_manager.is_running("SIM-CAM-01")
        assert worker_manager.is_running("SIM-CAM-02")
        assert worker_manager.is_running("SIM-CAM-03")
        assert worker_manager.is_running("SIM-CAM-04")

        # 7. Verify single camera restart
        start_test_streaming(StartTestStreamRequest(camera_id="SIM-CAM-01", loop=True), db)
        time.sleep(0.5)
        assert worker_manager.is_running("SIM-CAM-01")
        assert worker_manager.is_running("SIM-CAM-02")

        # 8. Clean stop all
        stop_test_streaming(StopTestStreamRequest(all=True), db)
        for c_id in camera_ids:
            assert not worker_manager.is_running(c_id)

    finally:
        for c_id in ["SIM-CAM-01", "SIM-CAM-02", "SIM-CAM-03", "SIM-CAM-04"]:
            worker_manager.stop_worker(c_id)
        db.close()

def test_change_test_video_assignment_isolated():
    """
    Verifies that changing video on one camera changes ONLY that camera,
    without overwriting or stopping other cameras.
    """
    db = SessionLocal()
    try:
        videos = scan_project_videos()
        assert len(videos) >= 2

        # Start all
        start_test_streaming(StartTestStreamRequest(all=True, loop=True), db)
        time.sleep(0.5)

        initial_src_cam2 = worker_manager.get_worker("SIM-CAM-02").stream_url
        initial_src_cam1 = worker_manager.get_worker("SIM-CAM-01").stream_url

        # Change video on SIM-CAM-01 to video[1]
        target_vid = videos[1]
        start_test_streaming(StartTestStreamRequest(camera_id="SIM-CAM-01", video_id=target_vid["id"], loop=True), db)
        time.sleep(0.5)

        # SIM-CAM-01 should have changed to target_vid file_path
        cam1_worker = worker_manager.get_worker("SIM-CAM-01")
        assert os.path.normpath(cam1_worker.stream_url) == os.path.normpath(target_vid["file_path"])

        # SIM-CAM-02 should remain untouched
        cam2_worker = worker_manager.get_worker("SIM-CAM-02")
        assert cam2_worker.stream_url == initial_src_cam2
        assert worker_manager.is_running("SIM-CAM-02")

    finally:
        stop_test_streaming(StopTestStreamRequest(all=True), db)
        db.close()
