import os
import glob
import urllib.parse
import shutil
import uuid
import cv2
from typing import Optional, List, Dict, Any, Union
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.db.database import get_db
from app.db.models.models import Camera, Event
from app.workers.video_worker import worker_manager
from app.services.event_service import EventService

router = APIRouter(prefix="/test-streams", tags=["Test Video Streaming"])

# --- Video Discovery Helper ---
def scan_project_videos() -> List[Dict[str, Any]]:
    """
    Scans the backend storage uploads directory for user-uploaded test video files (.mp4, .webm, .avi, .mkv, .mov).
    Only returns videos uploaded to the storage/uploads directory.
    """
    search_dirs = [
        os.path.join(settings.resolved_storage_dir, "uploads"),
        os.path.abspath("backend/storage/uploads"),
        os.path.abspath("storage/uploads"),
    ]

    discovered = []
    seen_paths = set()
    extensions = ("*.mp4", "*.webm", "*.avi", "*.mkv", "*.mov")

    for sdir in search_dirs:
        if not os.path.exists(sdir):
            continue
        for ext in extensions:
            pattern = os.path.join(sdir, ext)
            for fpath in glob.glob(pattern):
                norm_path = os.path.normpath(os.path.abspath(fpath))
                if norm_path in seen_paths:
                    continue
                seen_paths.add(norm_path)

                try:
                    fsize = os.path.getsize(norm_path)
                except OSError:
                    continue

                # Filter out empty or placeholder files < 10KB
                if fsize < 10240:
                    continue

                filename = os.path.basename(norm_path)
                # Exclude temporary, partial, or test feed artifacts
                if (
                    filename.startswith("test_feed_")
                    or filename.startswith("temp_")
                    or filename.startswith(".upload_temp_")
                    or filename.startswith(".temp_")
                    or filename.endswith(".tmp")
                    or filename.endswith(".part")
                    or filename.endswith(".upload")
                ):
                    continue

                file_id = os.path.splitext(filename)[0]
                ext_clean = os.path.splitext(filename)[1].replace(".", "").upper()

                if fsize >= 1024 * 1024:
                    size_str = f"{fsize / (1024 * 1024):.1f} MB"
                else:
                    size_str = f"{fsize / 1024:.0f} KB"

                # Check if file resides in static storage mount
                storage_base = os.path.normpath(os.path.abspath(settings.resolved_storage_dir))
                if norm_path.startswith(storage_base):
                    rel_to_storage = os.path.relpath(norm_path, storage_base).replace("\\", "/")
                    stream_url = f"/storage/{rel_to_storage}"
                else:
                    stream_url = f"/api/v1/test-streams/video/{urllib.parse.quote(filename)}"

                discovered.append({
                    "id": file_id,
                    "filename": filename,
                    "name": filename,
                    "file_path": norm_path,
                    "stream_url": stream_url,
                    "size_bytes": fsize,
                    "size_formatted": size_str,
                    "format": ext_clean,
                    "is_compatible": ext_clean in ["MP4", "WEBM"],
                    "resolution": "1280x720" if fsize > 1024 * 1024 else "640x480",
                    "fps": 25.0
                })

    # Sort deterministically by filename
    discovered.sort(key=lambda x: x["filename"].lower())
    return discovered


# --- 1-to-1 Video-to-Camera Mapping and Creation ---
def get_or_create_simulated_camera_for_video(video: Dict[str, Any], db: Session) -> Camera:
    """
    Idempotently retrieves or creates the simulated camera associated with this uploaded video file.
    Ensures a 1-to-1 persistent mapping with unique sequential IDs: SIM-CAM-01, SIM-CAM-02, etc.
    Never creates duplicate camera records for the same video.
    """
    file_path = os.path.normpath(os.path.abspath(video["file_path"]))
    filename = video["filename"]
    clean_name = os.path.splitext(filename)[0]

    existing_cams = db.query(Camera).filter(Camera.source_type.in_(["file", "simulated"])).all()

    # 1. Match by stream_url (normalized absolute path or relative path)
    for cam in existing_cams:
        if cam.stream_url:
            norm_cam_url = os.path.normpath(os.path.abspath(cam.stream_url))
            if norm_cam_url == file_path:
                cam.stream_url = file_path
                cam.source_type = "file"
                cam.ptz_supported = True
                cam.thermal_capable = True
                cam.enabled = True
                return cam

    # 2. Match by location or name
    for cam in existing_cams:
        if cam.location == f"Simulated CCTV Feed - {filename}":
            cam.stream_url = file_path
            cam.source_type = "file"
            cam.ptz_supported = True
            cam.thermal_capable = True
            cam.enabled = True
            return cam

    # 3. Allocate next sequential SIM-CAM-XX ID
    existing_sim_ids = set()
    for cam in existing_cams:
        if cam.id and cam.id.startswith("SIM-CAM-"):
            try:
                num = int(cam.id.split("-")[2])
                existing_sim_ids.add(num)
            except Exception:
                pass

    next_num = 1
    while next_num in existing_sim_ids:
        next_num += 1

    cam_id = f"SIM-CAM-{next_num:02d}"
    sector_letter = chr(65 + ((next_num - 1) % 26))
    cam_name = f"{cam_id} [{clean_name}]"

    new_camera = Camera(
        id=cam_id,
        name=cam_name,
        stream_url=file_path,
        source_type="file",
        status="STOPPED",
        sector=f"Sector {sector_letter} (Simulated)",
        location=f"Simulated CCTV Feed - {filename}",
        ip_address="127.0.0.1 (SIM)",
        fps=25,
        ptz_supported=True,
        thermal_capable=True,
        night_vision_mode="auto",
        enabled=True
    )
    db.add(new_camera)
    db.commit()
    db.refresh(new_camera)
    logger.info(f"Registered new simulated camera: {cam_id} mapped to video '{filename}'")
    return new_camera


def sync_all_uploaded_videos_to_cameras(db: Session) -> List[Dict[str, Any]]:
    """
    Scans all uploaded videos, guarantees 1-to-1 camera registration,
    and returns comprehensive mapping metadata.
    """
    videos = scan_project_videos()
    videos.sort(key=lambda v: v["filename"].lower())

    results = []
    for vid in videos:
        cam = get_or_create_simulated_camera_for_video(vid, db)
        is_running = worker_manager.is_running(cam.id)
        cur_status = "ONLINE" if is_running else (cam.status if cam.status in ["ONLINE", "STOPPED", "OFFLINE"] else "STOPPED")
        if cam.status != cur_status:
            cam.status = cur_status
            db.commit()

        results.append({
            "video": vid,
            "camera_id": cam.id,
            "camera_name": cam.name,
            "camera_status": cur_status,
            "is_streaming": is_running,
            "sector": cam.sector,
            "location": cam.location,
            "stream_url": f"/api/v1/streams/{cam.id}/mjpeg",
            "video_url": vid["stream_url"]
        })
    return results


# --- Pydantic Schemas ---
class StartTestStreamRequest(BaseModel):
    video_id: Optional[str] = None
    file_path: Optional[str] = None
    camera_id: Optional[str] = None
    camera_name: Optional[str] = None
    sector: Optional[str] = None
    location: Optional[str] = None
    loop: bool = True
    all: Optional[bool] = False

class StopTestStreamRequest(BaseModel):
    camera_id: Optional[str] = None
    all: bool = False

class LoopControlRequest(BaseModel):
    loop: bool

class BatchStartTestStreamRequest(BaseModel):
    streams: List[StartTestStreamRequest]


# --- Endpoints ---

@router.get("/videos")
def list_available_test_videos(db: Session = Depends(get_db)):
    """
    Discovers all local video files in the Upload section with their mapped simulated camera IDs.
    """
    fleet = sync_all_uploaded_videos_to_cameras(db)
    videos = [item["video"] for item in fleet]
    return {
        "videos": videos,
        "fleet": fleet,
        "total": len(videos),
        "message": f"Detected {len(videos)} uploaded surveillance video files."
    }


@router.get("/video/{filename}")
def stream_local_video_file(filename: str, request: Request):
    """
    Streams a local video file with native HTTP Range support (206 Partial Content).
    Enables smooth browser video playback, looping, and seeking without memory bloat.
    """
    clean_name = os.path.basename(filename)
    all_videos = scan_project_videos()
    match = next((v for v in all_videos if v["filename"] == clean_name or v["id"] == clean_name), None)

    if not match or not os.path.exists(match["file_path"]):
        raise HTTPException(status_code=404, detail=f"Local video file '{filename}' not found.")

    ext = match["format"].lower()
    media_type = "video/webm" if ext == "webm" else "video/mp4"

    return FileResponse(
        path=match["file_path"],
        media_type=media_type,
        filename=match["filename"]
    )


@router.get("/status")
def get_test_streaming_status(db: Session = Depends(get_db)):
    """
    Returns real-time status of simulated CCTV video streaming:
    'STREAMING' (at least one simulated feed running), 'STOPPED', or 'ERROR'.
    """
    active_cameras = worker_manager.get_active_cameras(db)
    simulated_active = [c for c in active_cameras if c.get("source_type") in ["file", "simulated"] or str(c.get("id", "")).startswith("SIM-CAM-")]

    is_streaming = len(simulated_active) > 0
    status_str = "STREAMING" if is_streaming else "STOPPED"

    all_vids = scan_project_videos()

    return {
        "is_streaming": is_streaming,
        "status": status_str,
        "active_count": len(simulated_active),
        "active_streams": simulated_active,
        "available_videos_count": len(all_vids),
        "total_simulated_cameras": len(all_vids)
    }


@router.post("/upload")
async def upload_test_videos(
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload section endpoint:
    Accepts one or multiple uploaded video files, saves to storage/uploads/,
    and automatically registers one simulated camera (SIM-CAM-XX) per video.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No video files received.")

    uploads_dir = os.path.join(settings.resolved_storage_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    allowed_exts = {".mp4", ".webm", ".avi", ".mov", ".mkv"}
    saved_files = []

    for file in files:
        if not file.filename:
            continue
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in allowed_exts:
            continue

        clean_filename = os.path.basename(file.filename)
        dest_path = os.path.join(uploads_dir, clean_filename)
        temp_dest = os.path.join(uploads_dir, f".upload_temp_{uuid.uuid4().hex[:8]}_{clean_filename}")

        try:
            with open(temp_dest, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Validate video integrity with OpenCV
            cap = cv2.VideoCapture(temp_dest)
            is_valid = cap.isOpened()
            if is_valid:
                ret, test_frame = cap.read()
                is_valid = bool(ret and test_frame is not None and test_frame.size > 0)
            cap.release()

            if not is_valid or os.path.getsize(temp_dest) < 10240:
                logger.warning(f"Uploaded video '{clean_filename}' is corrupt or unreadable. Discarding.")
                if os.path.exists(temp_dest):
                    os.remove(temp_dest)
                continue

            # Atomically move verified video into place
            if os.path.exists(dest_path):
                os.remove(dest_path)
            shutil.move(temp_dest, dest_path)
            saved_files.append(clean_filename)
        except Exception as e:
            logger.error(f"Error handling upload for {clean_filename}: {e}")
            if os.path.exists(temp_dest):
                try:
                    os.remove(temp_dest)
                except Exception:
                    pass

    if not saved_files:
        raise HTTPException(status_code=400, detail="No valid video files (.mp4, .webm, .avi, .mov, .mkv) could be processed.")

    # Synchronize all uploaded videos into simulated cameras
    sync_results = sync_all_uploaded_videos_to_cameras(db)

    from app.services.event_service import EventService
    EventService.broadcast_sync({"type": "CAMERAS_UPDATED", "total": len(sync_results)})

    return {
        "message": f"Successfully uploaded {len(saved_files)} video file(s).",
        "uploaded_files": saved_files,
        "total_videos": len(sync_results),
        "fleet": sync_results
    }


@router.delete("/videos/{video_id}")
def delete_test_video(video_id: str, db: Session = Depends(get_db)):
    """
    Deletes an uploaded video file from storage/uploads/.
    Safely stops and removes its associated simulated camera feed without deleting
    unrelated cameras, other feeds, or forensic evidence.
    """
    all_videos = scan_project_videos()
    clean_id = urllib.parse.unquote(video_id)
    target = next((v for v in all_videos if v["id"] == clean_id or v["filename"] == clean_id or v["id"] == video_id or v["filename"] == video_id), None)

    if not target:
        raise HTTPException(status_code=404, detail=f"Uploaded video '{video_id}' not found.")

    file_path = target["file_path"]

    # Find associated camera
    cam = db.query(Camera).filter(
        (Camera.stream_url == file_path) |
        (Camera.location == f"Simulated CCTV Feed - {target['filename']}")
    ).first()

    cam_id = cam.id if cam else None

    # Safely stop worker if running
    if cam_id:
        worker_manager.stop_worker(cam_id)
        try:
            # Check if camera has events; if yes, keep record marked OFFLINE to protect forensic integrity
            event_count = db.query(Event).filter(Event.camera_id == cam.id).count()
            if event_count > 0:
                cam.status = "OFFLINE"
                cam.enabled = False
                db.commit()
            else:
                db.delete(cam)
                db.commit()
        except Exception as e:
            logger.warning(f"Could not delete camera {cam_id} record: {e}")
            if cam:
                cam.status = "OFFLINE"
                cam.enabled = False
                db.commit()

    # Safely delete file from disk
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError as e:
            logger.error(f"Failed to delete video file {file_path}: {e}")

    # Re-sync remaining cameras
    sync_results = sync_all_uploaded_videos_to_cameras(db)

    from app.services.event_service import EventService
    EventService.broadcast_sync({"type": "CAMERAS_UPDATED", "deleted_camera_id": cam_id})

    return {
        "message": f"Video '{target['filename']}' deleted successfully.",
        "deleted_camera_id": cam_id,
        "remaining_videos": len(sync_results)
    }


@router.post("/sync-cameras")
def sync_cameras_endpoint(db: Session = Depends(get_db)):
    """
    Ensures every uploaded video in storage/uploads has a corresponding simulated camera SIM-CAM-XX.
    """
    sync_results = sync_all_uploaded_videos_to_cameras(db)
    return {
        "message": f"Synchronized {len(sync_results)} simulated cameras with uploaded video files.",
        "cameras": sync_results,
        "total": len(sync_results)
    }


@router.post("/start")
def start_test_streaming(payload: Optional[StartTestStreamRequest] = None, db: Session = Depends(get_db)):
    """
    Starts simulated CCTV camera streaming.
    - If payload is empty, or payload.all is True, or no specific camera_id/video_id is passed:
      Starts ALL uploaded videos as separate, independent simulated CCTV cameras (SIM-CAM-01, SIM-CAM-02, etc.).
    - If a specific camera_id or video_id is passed, starts or switches only that camera.
    Idempotent: clicking multiple times does NOT create duplicate cameras.
    """
    if payload is None:
        payload = StartTestStreamRequest()

    all_videos = scan_project_videos()
    if not all_videos:
        raise HTTPException(
            status_code=404,
            detail="No local test video files found in the Upload section (storage/uploads)."
        )

    all_videos.sort(key=lambda v: v["filename"].lower())

    # Case 1: Start single camera if specifically requested
    is_single_cam_request = bool(payload.camera_id and payload.camera_id.lower() != "new" and not payload.all)
    is_single_video_request = bool((payload.video_id or payload.file_path) and not payload.all)

    from app.services.event_service import EventService

    if is_single_cam_request or is_single_video_request:
        target_video = None
        if payload.video_id:
            target_video = next((v for v in all_videos if v["id"] == payload.video_id or v["filename"] == payload.video_id), None)
        elif payload.file_path:
            target_video = next((v for v in all_videos if v["file_path"] == payload.file_path), None)

        target_cam = None
        if payload.camera_id and payload.camera_id.lower() != "new":
            target_cam = db.query(Camera).filter(Camera.id == payload.camera_id).first()

        if not target_video and target_cam and target_cam.stream_url:
            target_video = next((v for v in all_videos if os.path.normpath(v["file_path"]) == os.path.normpath(target_cam.stream_url)), None)

        if not target_video:
            # Prevent feed duplication: select an available video not already actively streamed by another camera
            active_video_paths = {
                os.path.normpath(w.video_path) for c_id, w in worker_manager.workers.items()
                if w.is_alive() and (not target_cam or c_id != target_cam.id)
            }
            available_videos = [v for v in all_videos if os.path.normpath(v["file_path"]) not in active_video_paths]
            target_video = available_videos[0] if available_videos else all_videos[0]

        if not target_cam:
            target_cam = get_or_create_simulated_camera_for_video(target_video, db)
        else:
            target_cam.stream_url = target_video["file_path"]
            target_cam.status = "ONLINE"
            db.commit()

        # Stop existing worker for this camera before starting new stream
        if target_cam.id in worker_manager.workers:
            worker_manager.stop_worker(target_cam.id)

        started = worker_manager.start_worker(target_cam.id, "file", target_video["file_path"])
        if started and not payload.loop:
            worker_manager.set_worker_loop(target_cam.id, False)

        target_cam.status = "ONLINE"
        db.commit()

        EventService.broadcast_camera_lifecycle("CAMERA_STREAM_CHANGED", target_cam.id, "ONLINE", {
            "stream_url": target_video["file_path"],
            "video_url": target_video.get("stream_url"),
            "filename": target_video.get("filename")
        })

        return {
            "message": f"Test streaming started for camera '{target_cam.name}' ({target_cam.id})",
            "camera_id": target_cam.id,
            "camera_name": target_cam.name,
            "status": "STREAMING",
            "is_simulated": True,
            "video": target_video,
            "stream_url": f"/api/v1/streams/{target_cam.id}/mjpeg",
            "video_url": target_video["stream_url"],
            "worker_started": started,
            "sector": target_cam.sector,
            "location": target_cam.location,
            "loop": payload.loop
        }

    # Case 2: Multi-camera activation ("Start Test Streaming" clicked without specific single camera)
    # Automatically register one simulated camera for each uploaded video, and start independent stream
    activated_cameras = []

    for vid in all_videos:
        cam = get_or_create_simulated_camera_for_video(vid, db)
        # Check if worker is already running for this camera
        if not worker_manager.is_running(cam.id):
            started = worker_manager.start_worker(cam.id, "file", vid["file_path"])
            if started and not payload.loop:
                worker_manager.set_worker_loop(cam.id, False)

        cam.status = "ONLINE"
        activated_cameras.append({
            "camera_id": cam.id,
            "camera_name": cam.name,
            "video_filename": vid["filename"],
            "status": "ONLINE",
            "stream_url": f"/api/v1/streams/{cam.id}/mjpeg",
            "video_url": vid["stream_url"],
            "sector": cam.sector,
            "location": cam.location
        })
        EventService.broadcast_camera_lifecycle("CAMERA_ONLINE", cam.id, "ONLINE", {
            "stream_url": vid["file_path"],
            "video_url": vid.get("stream_url"),
            "filename": vid.get("filename")
        })

    db.commit()
    logger.info(f"Start Test Streaming activated {len(activated_cameras)} independent cameras.")

    return {
        "message": f"Successfully activated {len(activated_cameras)} independent simulated CCTV camera feeds.",
        "status": "STREAMING",
        "is_streaming": True,
        "active_count": len(activated_cameras),
        "total_cameras": len(activated_cameras),
        "cameras": activated_cameras
    }


@router.post("/stop")
def stop_test_streaming(payload: StopTestStreamRequest, db: Session = Depends(get_db)):
    """
    Stops simulated video test streaming.
    Supports stopping a single camera stream or stopping all active simulated feeds.
    Stopping one camera never stops other cameras.
    """
    stopped_count = 0

    if payload.all or not payload.camera_id:
        # Stop all active file-based simulated streams
        for cam_id, worker in list(worker_manager.workers.items()):
            if worker.source_type.lower() in ["file", "simulated"] or str(cam_id).startswith("SIM-CAM-"):
                worker_manager.stop_worker(cam_id)
                cam = db.query(Camera).filter(Camera.id == cam_id).first()
                if cam:
                    cam.status = "STOPPED"
                EventService.broadcast_camera_lifecycle("CAMERA_STOPPED", cam_id, "STOPPED")
                stopped_count += 1
        db.commit()
    else:
        # Stop specific camera only without affecting other running feeds
        worker_manager.stop_worker(payload.camera_id)
        cam = db.query(Camera).filter(Camera.id == payload.camera_id).first()
        if cam:
            cam.status = "STOPPED"
            db.commit()
        EventService.broadcast_camera_lifecycle("CAMERA_STOPPED", payload.camera_id, "STOPPED")
        stopped_count = 1

    return {
        "message": f"Stopped {stopped_count} simulated test stream(s).",
        "status": "STOPPED",
        "stopped_count": stopped_count,
        "is_streaming": len([w for w in worker_manager.workers.values() if w.is_alive()]) > 0
    }


@router.post("/{camera_id}/pause")
def pause_camera_stream(camera_id: str):
    """Pauses playback on a specific simulated camera stream."""
    success = worker_manager.pause_worker(camera_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"No active stream worker for camera '{camera_id}'")
    return {"message": f"Camera stream '{camera_id}' paused.", "camera_id": camera_id, "paused": True}


@router.post("/{camera_id}/resume")
def resume_camera_stream(camera_id: str):
    """Resumes playback on a paused camera stream."""
    success = worker_manager.resume_worker(camera_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"No active stream worker for camera '{camera_id}'")
    return {"message": f"Camera stream '{camera_id}' resumed.", "camera_id": camera_id, "paused": False}


@router.post("/{camera_id}/replay")
def replay_camera_stream(camera_id: str):
    """Replays video from the start and clears stale detection lifecycle state."""
    success = worker_manager.replay_worker(camera_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"No active stream worker for camera '{camera_id}'")
    return {"message": f"Camera stream '{camera_id}' replaying from beginning.", "camera_id": camera_id, "status": "REPLAYING"}


@router.post("/{camera_id}/loop")
def set_camera_loop(camera_id: str, payload: LoopControlRequest):
    """Enables or disables continuous looping for a camera stream."""
    success = worker_manager.set_worker_loop(camera_id, payload.loop)
    if not success:
        raise HTTPException(status_code=404, detail=f"No active stream worker for camera '{camera_id}'")
    return {"message": f"Camera stream '{camera_id}' loop set to {payload.loop}.", "camera_id": camera_id, "loop": payload.loop}


@router.post("/{camera_id}/stop")
def stop_single_camera_stream(camera_id: str, db: Session = Depends(get_db)):
    """Stops an individual camera stream without affecting any other running cameras."""
    worker_manager.stop_worker(camera_id)
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if cam:
        cam.status = "STOPPED"
        db.commit()
    return {"message": f"Camera stream '{camera_id}' stopped.", "camera_id": camera_id, "status": "STOPPED"}


@router.post("/batch-start")
def batch_start_test_streams(payload: BatchStartTestStreamRequest, db: Session = Depends(get_db)):
    """Starts multiple test streams concurrently across independent camera feeds."""
    results = []
    for stream_req in payload.streams:
        try:
            res = start_test_streaming(stream_req, db=db)
            results.append(res)
        except Exception as e:
            results.append({
                "video_id": stream_req.video_id,
                "camera_name": stream_req.camera_name,
                "error": str(e),
                "status": "ERROR"
            })
    return {
        "message": f"Processed {len(payload.streams)} stream requests.",
        "results": results,
        "active_count": len([r for r in results if r.get("status") in ["STREAMING", "ONLINE"]])
    }
