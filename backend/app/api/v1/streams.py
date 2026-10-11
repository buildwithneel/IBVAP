import os
import cv2
import time
import uuid
import shutil
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from app.db.database import get_db, SessionLocal
from app.db.models.models import Camera
from app.workers.video_worker import worker_manager
from app.core.config import settings
from app.core.logging import logger

router = APIRouter(tags=["Streams"])

import hashlib

def compute_file_sha256(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

@router.post("/streams/upload")
@router.post("/video/upload")
async def upload_video(
    file: UploadFile = File(...),
    camera_name: Optional[str] = Form(None),
    sector: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Accepts real uploaded video file, checks for duplicates via SHA-256 hash,
    validates video integrity with OpenCV, creates camera session, and launches AI worker.
    Cleans up any corrupt or failed uploads.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file has no filename.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".mp4", ".avi", ".mov", ".mkv"]:
        raise HTTPException(status_code=400, detail=f"Unsupported video format '{ext}'. Must be .mp4, .avi, .mov, or .mkv.")

    uploads_dir = os.path.abspath(os.path.join(settings.resolved_storage_dir, "uploads"))
    os.makedirs(uploads_dir, exist_ok=True)

    # 1. Save uploaded file to temporary file while calculating SHA-256 hash
    temp_filename = f"temp_upload_{uuid.uuid4().hex}{ext}"
    temp_path = os.path.join(uploads_dir, temp_filename)
    hasher = hashlib.sha256()

    try:
        with open(temp_path, "wb") as buffer:
            while chunk := await file.read(65536):
                hasher.update(chunk)
                buffer.write(chunk)
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    file_hash = hasher.hexdigest()

    # 2. Check for duplicate video files in storage/uploads
    existing_dest = None
    existing_filename = None
    for fname in os.listdir(uploads_dir):
        if fname == temp_filename:
            continue
        cand_path = os.path.join(uploads_dir, fname)
        if os.path.isfile(cand_path) and os.path.splitext(fname)[1].lower() in [".mp4", ".avi", ".mov", ".mkv"]:
            try:
                # Compare file sizes first as quick filter
                if os.path.getsize(cand_path) == os.path.getsize(temp_path):
                    if compute_file_sha256(cand_path) == file_hash:
                        existing_dest = cand_path
                        existing_filename = fname
                        break
            except Exception:
                continue

    if existing_dest:
        # Duplicate video detected: discard temp file and reuse existing storage file
        if os.path.exists(temp_path):
            os.remove(temp_path)
        abs_dest = existing_dest
        filename = existing_filename
        is_reused = True
    else:
        # New unique video: sanitize filename using original base + short hash
        clean_base = "".join(c for c in os.path.splitext(file.filename)[0] if c.isalnum() or c in ("-", "_", " ")).strip()
        if not clean_base:
            clean_base = f"video_{file_hash[:8]}"
        final_filename = f"{clean_base}_{file_hash[:8]}{ext}"
        abs_dest = os.path.join(uploads_dir, final_filename)
        if os.path.exists(abs_dest):
            os.remove(temp_path)
        else:
            os.rename(temp_path, abs_dest)
        filename = final_filename
        is_reused = False

    # 3. Validate video integrity with OpenCV before touching DB
    cap = cv2.VideoCapture(abs_dest)
    if not cap.isOpened():
        cap.release()
        if not is_reused and os.path.exists(abs_dest):
            os.remove(abs_dest)
        raise HTTPException(status_code=400, detail="Invalid or corrupt video file: OpenCV could not open container.")

    ret, test_frame = cap.read()
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()

    if not ret or test_frame is None or test_frame.size == 0:
        if not is_reused and os.path.exists(abs_dest):
            os.remove(abs_dest)
        raise HTTPException(status_code=400, detail="Corrupted video file: Unable to decode frames from stream.")

    # 4. Check if an existing Camera in DB already points to this video and is ONLINE
    existing_camera = db.query(Camera).filter(Camera.stream_url == abs_dest).first()
    if existing_camera and worker_manager.is_running(existing_camera.id):
        # Already actively streamed: return existing session without duplication
        return {
            "message": "Existing active stream found for this video. Reusing camera session.",
            "camera_id": existing_camera.id,
            "filename": filename,
            "file_path": abs_dest,
            "video_path": abs_dest,
            "worker_started": False,
            "duplicate_prevented": True,
            "status": worker_manager.get_status(existing_camera.id)
        }

    # 5. Create Camera record with unique camera ID and metadata
    cam_count = db.query(Camera).count() + 1
    unique_cam_id = f"CAM-UP-{uuid.uuid4().hex[:6].upper()}"
    cam_name = camera_name.strip() if camera_name else f"Uploaded Stream ({file.filename})"

    camera = Camera(
        id=unique_cam_id,
        name=cam_name,
        stream_url=abs_dest,
        source_type="file",
        status="STARTING",
        sector=sector.strip() if sector else f"Sector {chr(65 + (cam_count % 26))} (Upload)",
        location="Uploaded Video File Source",
        fps=25
    )
    db.add(camera)
    db.commit()
    db.refresh(camera)

    # 6. Launch AI worker thread
    started = worker_manager.start_worker(camera.id, "file", abs_dest)

    # First frame confirmation window
    worker_ok = False
    for _ in range(15):
        if worker_manager.is_running(camera.id):
            worker_ok = True
            break
        worker = worker_manager.workers.get(camera.id)
        if worker and worker.status == "OFFLINE":
            # Worker failed: rollback DB entry and clean up if not reused
            worker_manager.stop_worker(camera.id)
            db.delete(camera)
            db.commit()
            if not is_reused and os.path.exists(abs_dest):
                os.remove(abs_dest)
            raise HTTPException(status_code=400, detail=f"Failed to decode uploaded video: {worker.last_error}")
        time.sleep(0.1)

    return {
        "message": "Video file uploaded and AI ingestion worker launched.",
        "camera_id": camera.id,
        "filename": filename,
        "file_path": abs_dest,
        "video_path": abs_dest,
        "worker_started": started,
        "is_reused": is_reused,
        "status": worker_manager.get_status(camera.id)
    }

@router.delete("/streams/uploads/{filename}")
def delete_uploaded_video(filename: str, db: Session = Depends(get_db)):
    """
    Safely removes an uploaded video file, stops associated camera workers,
    and removes corresponding camera DB records.
    """
    clean_name = os.path.basename(filename)
    target_path = os.path.abspath(os.path.join(settings.resolved_storage_dir, "uploads", clean_name))

    # Stop any cameras using this video
    cams = db.query(Camera).filter(Camera.stream_url == target_path).all()
    for cam in cams:
        worker_manager.stop_worker(cam.id)
        db.delete(cam)
    db.commit()

    if os.path.exists(target_path):
        os.remove(target_path)
        return {"message": f"Video '{clean_name}' and associated camera sessions removed successfully."}
    return {"message": f"Associated camera records cleaned. File '{clean_name}' was not present on disk."}

@router.post("/streams/cleanup")
def cleanup_unused_uploads(db: Session = Depends(get_db)):
    """
    Cleans up orphaned, incomplete, or 0-byte video files in storage/uploads
    that are not actively used by any camera or evidence record.
    """
    uploads_dir = os.path.abspath(os.path.join(settings.resolved_storage_dir, "uploads"))
    if not os.path.exists(uploads_dir):
        return {"removed_count": 0, "freed_bytes": 0}

    active_urls = {os.path.abspath(c.stream_url) for c in db.query(Camera).all() if c.stream_url}
    removed = []
    freed_bytes = 0

    for fname in os.listdir(uploads_dir):
        fpath = os.path.abspath(os.path.join(uploads_dir, fname))
        if not os.path.isfile(fpath):
            continue
        # Clean up temporary or 0-byte files
        if fname.startswith("temp_upload_") or os.path.getsize(fpath) == 0:
            freed_bytes += os.path.getsize(fpath)
            os.remove(fpath)
            removed.append(fname)

    return {
        "message": f"Cleaned up {len(removed)} temporary or corrupt upload files.",
        "removed_files": removed,
        "freed_bytes": freed_bytes
    }

@router.post("/streams/{camera_id}/start")
def start_stream(camera_id: str, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail=f"Camera with ID '{camera_id}' not found.")

    started = worker_manager.start_worker(camera.id, camera.source_type, camera.stream_url)
    return {
        "camera_id": camera.id,
        "status": worker_manager.get_status(camera.id),
        "message": "Worker thread launched successfully." if started else "Worker already running."
    }

@router.post("/streams/{camera_id}/stop")
def stop_stream(camera_id: str, db: Session = Depends(get_db)):
    stopped = worker_manager.stop_worker(camera_id)
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if camera:
        camera.status = "STOPPED"
        db.commit()

    return {
        "camera_id": camera_id,
        "status": "STOPPED",
        "message": "Worker thread stopped." if stopped else "Worker was already stopped."
    }

def generate_mjpeg_stream(camera_id: str):
    # Self-healing: if worker is not alive, auto-start worker for registered camera
    worker = worker_manager.get_worker(camera_id)
    if not worker or not worker.is_alive():
        db = SessionLocal()
        try:
            cam = db.query(Camera).filter(Camera.id == camera_id).first()
            if cam and cam.stream_url and cam.enabled:
                logger.info(f"Self-healing: Auto-starting worker for camera '{camera_id}' ({cam.name})...")
                worker_manager.start_worker(cam.id, cam.source_type or "file", cam.stream_url)
        except Exception as e:
            logger.warning(f"Self-healing start failed for camera '{camera_id}': {e}")
        finally:
            db.close()

    # Initial grace window: wait up to 5 seconds for worker to become available
    for _ in range(50):
        worker = worker_manager.get_worker(camera_id)
        if worker and worker.is_alive() and worker.status in ["ONLINE", "STARTING"]:
            if worker_manager.get_latest_frame(camera_id) is not None:
                break
        time.sleep(0.1)

    consecutive_empty = 0
    while True:
        worker = worker_manager.get_worker(camera_id)
        if not worker or not worker.is_alive():
            consecutive_empty += 1
            if consecutive_empty > 60: # 2 seconds of worker being stopped
                break
            time.sleep(0.033)
            continue

        frame = worker_manager.get_latest_frame(camera_id)
        if frame is not None:
            consecutive_empty = 0
            ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
        else:
            consecutive_empty += 1
            if consecutive_empty > 150: # 5 seconds without frames
                break

        time.sleep(0.033)

@router.get("/streams/{camera_id}/mjpeg")
def stream_mjpeg(camera_id: str, v: Optional[str] = None, rev: Optional[str] = None):
    """
    Live MJPEG Video Stream endpoint. Serves live webcam/video frames with AI overlays to HTML <img> tags.
    Supports query parameters 'v' (source revision) and 'rev' for client reconnect management.
    """
    return StreamingResponse(
        generate_mjpeg_stream(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

def generate_raw_mjpeg_stream(camera_id: str):
    # Self-healing: if worker is not alive, auto-start worker for registered camera
    worker = worker_manager.get_worker(camera_id)
    if not worker or not worker.is_alive():
        db = SessionLocal()
        try:
            cam = db.query(Camera).filter(Camera.id == camera_id).first()
            if cam and cam.stream_url and cam.enabled:
                logger.info(f"Self-healing: Auto-starting worker for camera '{camera_id}' ({cam.name})...")
                worker_manager.start_worker(cam.id, cam.source_type or "file", cam.stream_url)
        except Exception as e:
            logger.warning(f"Self-healing start failed for camera '{camera_id}': {e}")
        finally:
            db.close()

    # Initial grace window: wait up to 5 seconds for worker to become available
    for _ in range(50):
        worker = worker_manager.get_worker(camera_id)
        if worker and worker.is_alive() and worker.status in ["ONLINE", "STARTING"]:
            raw_f = worker_manager.get_latest_raw_frame(camera_id)
            if raw_f is None:
                raw_f = worker_manager.get_latest_frame(camera_id)
            if raw_f is not None:
                break
        time.sleep(0.1)

    consecutive_empty = 0
    while True:
        worker = worker_manager.get_worker(camera_id)
        if not worker or not worker.is_alive():
            consecutive_empty += 1
            if consecutive_empty > 60:
                break
            time.sleep(0.033)
            continue

        frame = worker_manager.get_latest_raw_frame(camera_id)
        if frame is None:
            frame = worker_manager.get_latest_frame(camera_id)

        if frame is not None:
            consecutive_empty = 0
            ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
        else:
            consecutive_empty += 1
            if consecutive_empty > 150:
                break

        time.sleep(0.033)

@router.get("/streams/{camera_id}/raw")
@router.get("/streams/{camera_id}/raw-mjpeg")
def stream_raw_mjpeg(camera_id: str, v: Optional[str] = None, rev: Optional[str] = None):
    """
    Live Raw MJPEG Video Stream endpoint. Serves unannotated clean footage to HTML <img> tags.
    """
    return StreamingResponse(
        generate_raw_mjpeg_stream(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
