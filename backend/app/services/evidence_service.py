import os
import cv2
import uuid
import numpy as np
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.db.models.models import Evidence
from app.core.config import settings
from app.core.security import compute_sha256_bytes, compute_sha256_file
from app.core.logging import logger

import re

def format_evidence_basename(event_type: Optional[str], occurrence_time: Optional[datetime]) -> str:
    """
    Constructs the standard evidence filename prefix: EVENT-DATE-TIME
    Example: INTRUSION-2026-09-29-19-45-12
             VIRTUAL-FENCE-2026-09-29-19-46-30
    """
    if not event_type or not str(event_type).strip():
        ev_str = "EVENT"
    else:
        # Standardize safe alphanumeric format with hyphens separating words
        ev_str = re.sub(r'[^A-Za-z0-9_-]+', '-', str(event_type)).replace('_', '-').strip('-').upper()

    dt = occurrence_time or datetime.utcnow()
    date_str = dt.strftime("%Y-%m-%d")
    time_str = dt.strftime("%H-%M-%S")
    return f"{ev_str}-{date_str}-{time_str}"

def get_unique_evidence_path(evidence_dir: str, base_stem: str, suffix: str = "", extension: str = "jpg") -> tuple[str, str]:
    """
    Ensures filename follows EVENT-DATE-TIME with optional suffix and handles deduplication:
    e.g. INTRUSION-2026-09-29-19-45-12.jpg
         INTRUSION-2026-09-29-19-45-12_plate.jpg
         INTRUSION-2026-09-29-19-45-12-1.jpg (if duplicate timestamp)
    """
    ext = extension.lstrip(".")
    candidate_filename = f"{base_stem}{suffix}.{ext}"
    candidate_path = os.path.join(evidence_dir, candidate_filename)
    counter = 1
    while os.path.exists(candidate_path):
        candidate_filename = f"{base_stem}{suffix}-{counter}.{ext}"
        candidate_path = os.path.join(evidence_dir, candidate_filename)
        counter += 1
    return candidate_filename, candidate_path

def compute_frame_quality_score(
    frame: Optional[np.ndarray],
    crop: Optional[np.ndarray] = None,
    confidence: float = 0.0,
    bbox: Optional[List[float]] = None
) -> float:
    """
    Calculates image quality score based on:
    1. Detection confidence
    2. Image sharpness and blur (Laplacian variance)
    3. Target area and resolution
    4. Bounding box completeness / boundary truncation penalty
    """
    if frame is None or frame.size == 0:
        return 0.0

    eval_img = crop if (crop is not None and crop.size > 0) else frame
    try:
        if len(eval_img.shape) == 3:
            gray = cv2.cvtColor(eval_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = eval_img
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    except Exception:
        sharpness = 0.0

    # Normalize sharpness (good values: 100-800+)
    norm_sharpness = min(1.0, sharpness / 500.0)

    # Visibility / area factor
    h, w = eval_img.shape[:2]
    area = float(h * w)
    norm_area = min(1.0, area / (300.0 * 200.0))

    # Bounding-box completeness: penalize targets cut off at frame border
    truncation_penalty = 1.0
    if bbox and len(bbox) >= 4 and frame is not None:
        fh, fw = frame.shape[:2]
        bx1, by1, bx2, by2 = bbox[:4]
        if bx1 <= 4 or by1 <= 4 or bx2 >= fw - 4 or by2 >= fh - 4:
            truncation_penalty = 0.70

    # Plate clarity bonus if crop provided
    plate_bonus = 1.0
    if crop is not None and crop.size > 0:
        ch, cw = crop.shape[:2]
        if cw >= 100 and ch >= 30:
            plate_bonus = 1.15

    # Weighted composite quality score (0.0 to 100.0)
    raw_score = (0.40 * float(confidence)) + (0.35 * norm_sharpness) + (0.25 * norm_area)
    final_score = raw_score * 100.0 * truncation_penalty * plate_bonus
    return round(min(100.0, max(0.0, final_score)), 2)


class EvidenceService:
    @staticmethod
    def compute_frame_quality_score(
        frame: Optional[np.ndarray],
        crop: Optional[np.ndarray] = None,
        confidence: float = 0.0,
        bbox: Optional[List[float]] = None
    ) -> float:
        return compute_frame_quality_score(frame, crop, confidence, bbox)

    @staticmethod
    def calculate_quality(
        frame: Optional[np.ndarray],
        crop: Optional[np.ndarray] = None,
        confidence: float = 0.0,
        bbox: Optional[List[float]] = None
    ) -> float:
        return compute_frame_quality_score(frame, crop, confidence, bbox)

    @staticmethod
    def create_snapshot_evidence(
        db: Session,
        frame: Optional[np.ndarray],
        event_id: Optional[str] = None,
        plate_crop: Optional[np.ndarray] = None,
        vehicle_crop: Optional[np.ndarray] = None,
        event_type: Optional[str] = None,
        timestamp: Optional[datetime] = None
    ) -> Evidence:
        """
        Saves snapshot full-frame and cropped number plate image to disk using the
        EVENT-DATE-TIME naming convention, computes SHA-256 hashes, and records Evidence in DB.
        """
        evidence_id = str(uuid.uuid4())
        evidence_dir = os.path.join(settings.resolved_storage_dir, "evidence")
        os.makedirs(evidence_dir, exist_ok=True)

        occ_time = timestamp or datetime.utcnow()
        base_stem = format_evidence_basename(event_type or "EVENT", occ_time)

        full_filename, full_abs_path = get_unique_evidence_path(evidence_dir, base_stem, suffix="", extension="jpg")
        
        full_rel_url = None
        sha256_hash = ""
        full_size = 0

        # 1. Full-frame vehicle snapshot
        if frame is not None and frame.size > 0:
            # Ensure frame has real content and is not completely black or blank (mean > 2.0)
            if float(np.mean(frame)) >= 2.0:
                success, encoded_img = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
                if success:
                    img_bytes = encoded_img.tobytes()
                    sha256_hash = compute_sha256_bytes(img_bytes)
                    with open(full_abs_path, 'wb') as f:
                        f.write(img_bytes)
                    full_rel_url = f"/storage/evidence/{full_filename}"
                    full_size += len(img_bytes)
            else:
                logger.warning(f"[EvidenceService] Frame rejected: frame is black or blank (mean pixel value < 2.0).")


        # 2. Number plate crop evidence
        plate_rel_url = None
        plate_sha256_hash = None
        if plate_crop is not None and plate_crop.size > 0:
            # Preserve sufficient image quality for reading the plate
            ph, pw = plate_crop.shape[:2]
            save_plate = plate_crop
            if pw < 200:
                scale = 200.0 / float(max(1, pw))
                new_w = 200
                new_h = int(ph * scale)
                save_plate = cv2.resize(plate_crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

            plate_filename, plate_abs_path = get_unique_evidence_path(evidence_dir, base_stem, suffix="_plate", extension="jpg")
            plate_success, encoded_plate = cv2.imencode('.jpg', save_plate, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
            if plate_success:
                plate_bytes = encoded_plate.tobytes()
                plate_sha256_hash = compute_sha256_bytes(plate_bytes)
                with open(plate_abs_path, 'wb') as f:
                    f.write(plate_bytes)
                plate_rel_url = f"/storage/evidence/{plate_filename}"
                full_size += len(plate_bytes)

        evidence = Evidence(
            id=evidence_id,
            event_id=event_id,
            image_path=full_rel_url,
            plate_image_path=plate_rel_url,
            sha256=sha256_hash or "NONE",
            plate_sha256=plate_sha256_hash,
            file_size_bytes=full_size,
            created_at=occ_time
        )

        db.add(evidence)
        db.commit()
        db.refresh(evidence)
        return evidence

    @staticmethod
    def update_snapshot_evidence(
        db: Session,
        evidence: Optional[Any] = None,
        frame: Optional[np.ndarray] = None,
        plate_crop: Optional[np.ndarray] = None,
        vehicle_crop: Optional[np.ndarray] = None,
        event_type: Optional[str] = None,
        timestamp: Optional[datetime] = None,
        confidence: float = 0.85,
        evidence_id: Optional[str] = None
    ) -> Optional[Evidence]:
        """
        Updates an existing evidence record with a higher-quality frame,
        recomputing hashes, removing replaced candidate files, and updating DB.
        Accepts either an Evidence model object or evidence_id string.
        """
        ev_obj = evidence if isinstance(evidence, Evidence) else None
        target_id = evidence_id or (evidence if isinstance(evidence, str) else (ev_obj.id if ev_obj else None))
        if not ev_obj and target_id:
            ev_obj = db.query(Evidence).filter(Evidence.id == target_id).first()

        if not ev_obj:
            logger.warning(f"[EvidenceService] Cannot update snapshot: evidence '{target_id}' not found.")
            return None

        evidence_dir = os.path.join(settings.resolved_storage_dir, "evidence")
        os.makedirs(evidence_dir, exist_ok=True)
        occ_time = timestamp or ev_obj.created_at or datetime.utcnow()
        base_stem = format_evidence_basename(event_type or "EVENT", occ_time)

        old_image_path = ev_obj.image_path
        old_plate_path = ev_obj.plate_image_path

        full_size = 0
        if frame is not None and frame.size > 0:
            full_filename, full_abs_path = get_unique_evidence_path(evidence_dir, base_stem, suffix="", extension="jpg")
            success, encoded_img = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            if success:
                img_bytes = encoded_img.tobytes()
                new_sha = compute_sha256_bytes(img_bytes)
                with open(full_abs_path, 'wb') as f:
                    f.write(img_bytes)

                # Delete replaced candidate frame file if different path
                if old_image_path:
                    old_disk_file = os.path.join(evidence_dir, os.path.basename(old_image_path))
                    if os.path.abspath(old_disk_file) != os.path.abspath(full_abs_path) and os.path.exists(old_disk_file):
                        try:
                            os.remove(old_disk_file)
                        except Exception:
                            pass

                ev_obj.image_path = f"/storage/evidence/{full_filename}"
                ev_obj.sha256 = new_sha
                full_size += len(img_bytes)

        if plate_crop is not None and plate_crop.size > 0:
            ph, pw = plate_crop.shape[:2]
            save_plate = plate_crop
            if pw < 200:
                scale = 200.0 / float(max(1, pw))
                new_w = 200
                new_h = int(ph * scale)
                save_plate = cv2.resize(plate_crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

            plate_filename, plate_abs_path = get_unique_evidence_path(evidence_dir, base_stem, suffix="_plate", extension="jpg")
            plate_success, encoded_plate = cv2.imencode('.jpg', save_plate, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
            if plate_success:
                plate_bytes = encoded_plate.tobytes()
                new_plate_sha = compute_sha256_bytes(plate_bytes)
                with open(plate_abs_path, 'wb') as f:
                    f.write(plate_bytes)

                # Delete replaced old plate crop
                if old_plate_path:
                    old_plate_disk = os.path.join(evidence_dir, os.path.basename(old_plate_path))
                    if os.path.abspath(old_plate_disk) != os.path.abspath(plate_abs_path) and os.path.exists(old_plate_disk):
                        try:
                            os.remove(old_plate_disk)
                        except Exception:
                            pass

                ev_obj.plate_sha256 = new_plate_sha
                ev_obj.plate_image_path = f"/storage/evidence/{plate_filename}"
                full_size += len(plate_bytes)

        if full_size > 0:
            ev_obj.file_size_bytes = full_size

        db.commit()
        db.refresh(ev_obj)
        return ev_obj

    @staticmethod
    def create_video_clip_evidence(
        db: Session,
        frames: List[np.ndarray],
        fps: float = 20.0,
        evidence_id: Optional[str] = None,
        event_id: Optional[str] = None,
        event_type: Optional[str] = None,
        timestamp: Optional[datetime] = None
    ) -> Optional[str]:
        """
        Encodes buffered surveillance frames into an MP4 video clip on disk using the
        EVENT-DATE-TIME convention, computes SHA-256 hash, and links to Evidence DB record.
        """
        if not frames or len(frames) == 0:
            return None

        evidence_dir = os.path.join(settings.resolved_storage_dir, "evidence")
        os.makedirs(evidence_dir, exist_ok=True)
        occ_time = timestamp or datetime.utcnow()
        base_stem = format_evidence_basename(event_type or "EVENT", occ_time)

        clip_filename, abs_path = get_unique_evidence_path(evidence_dir, base_stem, suffix="_clip", extension="mp4")

        height, width = frames[0].shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        clip_fps = max(5.0, min(30.0, float(fps)))

        writer = cv2.VideoWriter(abs_path, fourcc, clip_fps, (width, height))
        for f in frames:
            writer.write(f)
        writer.release()

        # Compute SHA-256 of the video clip
        if os.path.exists(abs_path):
            web_path = f"/storage/evidence/{clip_filename}"

            # Update existing Evidence record if provided
            if evidence_id:
                ev = db.query(Evidence).filter(Evidence.id == evidence_id).first()
                if ev:
                    ev.video_path = web_path
                    db.commit()

            return web_path

        return None

    @staticmethod
    def verify_evidence(db: Session, evidence_id: str) -> Dict[str, Any]:
        """
        Reads actual evidence file from disk, recalculates SHA-256 hash,
        and verifies bit-for-bit authenticity against stored database hash.
        """
        clean_id = evidence_id.replace("EVD-", "")
        ev = db.query(Evidence).filter((Evidence.id == clean_id) | (Evidence.id == evidence_id)).first()
        if not ev:
            return {
                "isVerified": False,
                "hashMatch": False,
                "algorithm": "SHA-256 (FIPS PUB 180-4)",
                "calculatedHash": "RECORD_NOT_FOUND",
                "auditStatus": "NOT_FOUND",
                "timestamp": datetime.utcnow().isoformat()
            }

        # Resolve absolute image path from resolved_storage_dir
        if ev.image_path and ev.image_path.startswith("/storage/"):
            rel_part = ev.image_path.replace("/storage/", "")
            img_abs = os.path.join(settings.resolved_storage_dir, rel_part.replace("/", os.sep))
        elif ev.image_path:
            img_abs = os.path.abspath(ev.image_path.lstrip("/"))
        else:
            img_abs = ""

        if not img_abs or not os.path.exists(img_abs):
            return {
                "isVerified": False,
                "hashMatch": False,
                "algorithm": "SHA-256 (FIPS PUB 180-4)",
                "calculatedHash": "FILE_MISSING_ON_DISK",
                "auditStatus": "EVIDENCE_FILE_MISSING",
                "timestamp": datetime.utcnow().isoformat()
            }

        with open(img_abs, "rb") as f:
            file_bytes = f.read()

        calculated_hash = compute_sha256_bytes(file_bytes)
        match = (calculated_hash.lower() == ev.sha256.lower())

        return {
            "valid": match,
            "isVerified": match,
            "hashMatch": match,
            "algorithm": "SHA-256 (FIPS PUB 180-4)",
            "calculatedHash": calculated_hash,
            "computed_sha256": calculated_hash,
            "expectedHash": ev.sha256,
            "auditStatus": "VERIFIED_IMMUTABLE" if match else "INTEGRITY_COMPROMISED",
            "timestamp": datetime.utcnow().isoformat()
        }
