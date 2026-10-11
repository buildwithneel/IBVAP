import os
import cv2
import numpy as np
import re
from typing import Optional, Dict, Any, List
from collections import defaultdict
from app.core.logging import logger

import threading

class ANPREngine:
    """
    Automatic Number Plate Recognition (ANPR) pipeline.
    Architecture:
    1. Dedicated License Plate Detector (models/license_plate_yolov8n.pt).
    2. Plate ROI Crop with Boundary Padding.
    3. CLAHE & Bilateral Contrast / Edge Preprocessing.
    4. Optical Character Recognition via EasyOCR.
    5. Regex-based Alphanumeric Character Cleaning (4 to 12 chars).
    6. Temporal Track-level Voting across frames.
    7. Truthful Result (Returns 'UNKNOWN' if unreadable or not detected).
    """
    _cached_plate_detector = None
    _cached_paddle_ocr = None
    _cached_ocr_reader = None
    _cached_ocr_type = None
    _lock = threading.Lock()

    def __init__(self, model_path: str = "models/license_plate_yolov8n.pt"):
        self.model_path = model_path
        self.plate_detector = None
        self.ocr_reader = None

        # Temporal Voting Cache: track_id -> { plate_text: total_confidence_weight }
        self.track_votes: Dict[int, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
        # Resolved Plate Cache: track_id -> resolved_dict
        self.track_resolved: Dict[int, Dict[str, Any]] = {}
        # Track plate crop images: track_id -> np.ndarray
        self.track_plate_crops: Dict[int, np.ndarray] = {}
        # Track plate bounding box within vehicle: track_id -> [x1, y1, x2, y2]
        self.track_plate_bboxes: Dict[int, List[int]] = {}

        self._init_plate_detector()
        self._init_ocr()

    def _init_plate_detector(self):
        """Loads fine-tuned YOLOv8n license plate detector."""
        with ANPREngine._lock:
            if ANPREngine._cached_plate_detector is not None:
                self.plate_detector = ANPREngine._cached_plate_detector
                return

            try:
                from ultralytics import YOLO
                # Check relative to backend or root
                possible_paths = [
                    self.model_path,
                    os.path.join(os.getcwd(), self.model_path),
                    os.path.join(os.path.dirname(__file__), "..", "..", self.model_path)
                ]
                chosen_path = None
                for p in possible_paths:
                    if os.path.exists(p):
                        chosen_path = p
                        break

                if chosen_path:
                    logger.info(f"Loading license plate detector from '{chosen_path}'...")
                    self.plate_detector = YOLO(chosen_path)
                    ANPREngine._cached_plate_detector = self.plate_detector
                    logger.info("License plate detector loaded successfully.")
                else:
                    logger.warning(f"License plate model not found at {possible_paths}. ANPR will use contour fallback.")
                    self.plate_detector = None
            except Exception as e:
                logger.warning(f"Could not load YOLO license plate detector: {e}")
                self.plate_detector = None

    def _init_ocr(self):
        """Initializes PaddleOCR engine for high-performance plate recognition, with EasyOCR fallback."""
        with ANPREngine._lock:
            if ANPREngine._cached_ocr_type is not None:
                self.ocr_engine_type = ANPREngine._cached_ocr_type
                self.paddle_ocr = ANPREngine._cached_paddle_ocr
                self.ocr_reader = ANPREngine._cached_ocr_reader
                return

            self.ocr_engine_type = "PADDLE"
            self.paddle_ocr = None
            self.ocr_reader = None

            try:
                from paddleocr import PaddleOCR
                import torch
                has_gpu = torch.cuda.is_available()
                self.paddle_ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False, use_gpu=has_gpu)
                ANPREngine._cached_paddle_ocr = self.paddle_ocr
                ANPREngine._cached_ocr_type = "PADDLE"
                logger.info(f"PaddleOCR engine initialized successfully (GPU={has_gpu}).")
            except Exception as e:
                logger.warning(f"Could not load PaddleOCR engine ({e}). Falling back to EasyOCR...")
                self.paddle_ocr = None
                try:
                    import easyocr
                    import torch
                    has_gpu = torch.cuda.is_available()
                    self.ocr_reader = easyocr.Reader(['en'], gpu=has_gpu, verbose=False)
                    self.ocr_engine_type = "EASYOCR"
                    ANPREngine._cached_ocr_reader = self.ocr_reader
                    ANPREngine._cached_ocr_type = "EASYOCR"
                    logger.info(f"EasyOCR fallback reader initialized (GPU={has_gpu}).")
                except Exception as e2:
                    logger.error(f"Failed to initialize EasyOCR fallback reader: {e2}")
                    self.ocr_reader = None
                    self.ocr_engine_type = "NONE"
                    ANPREngine._cached_ocr_type = "NONE"

    def _preprocess_plate_crop(self, crop: np.ndarray) -> np.ndarray:
        """
        Applies contrast enhancement (CLAHE) and edge-preserving bilateral filtering.
        Upscales small plate crops to ensure OCR readability.
        """
        h, w = crop.shape[:2]
        if w < 180:
            scale = 180.0 / float(w)
            new_w = 180
            new_h = int(h * scale)
            crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop

        # Contrast Limited Adaptive Histogram Equalization
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # Bilateral filter to reduce noise while preserving sharp character edges
        denoised = cv2.bilateralFilter(enhanced, 7, 35, 35)
        return denoised

    def _locate_plate(self, vehicle_img: np.ndarray) -> tuple[Optional[np.ndarray], Optional[List[int]]]:
        """
        Localizes license plate within vehicle crop using YOLO detector or contour fallback.
        Returns (cropped plate image, [x1, y1, x2, y2]) or (None, None).
        """
        vh, vw = vehicle_img.shape[:2]

        # 1. Use dedicated YOLO license plate detector
        if self.plate_detector is not None:
            try:
                results = self.plate_detector.predict(
                    vehicle_img,
                    conf=0.20,
                    verbose=False
                )
                if results and len(results[0].boxes) > 0:
                    # Select highest-confidence plate box
                    best_box = max(results[0].boxes, key=lambda b: float(b.conf[0].item()))
                    coords = best_box.xyxy[0].tolist()
                    x1, y1, x2, y2 = [int(c) for c in coords]

                    # Add 4% safety margin
                    pad_x = int((x2 - x1) * 0.04)
                    pad_y = int((y2 - y1) * 0.04)
                    x1 = max(0, x1 - pad_x)
                    y1 = max(0, y1 - pad_y)
                    x2 = min(vw, x2 + pad_x)
                    y2 = min(vh, y2 + pad_y)

                    if (x2 - x1) > 10 and (y2 - y1) > 5:
                        return vehicle_img[y1:y2, x1:x2], [x1, y1, x2, y2]
            except Exception as e:
                logger.debug(f"Plate YOLO detection error: {e}")

        # 2. Geometric contour fallback
        gray = cv2.cvtColor(vehicle_img, cv2.COLOR_BGR2GRAY) if len(vehicle_img.shape) == 3 else vehicle_img
        filtered = cv2.bilateralFilter(gray, 11, 17, 17)
        edged = cv2.Canny(filtered, 30, 200)

        contours, _ = cv2.findContours(edged.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.018 * peri, True)
            if len(approx) == 4:
                x, y, w, h = cv2.boundingRect(approx)
                aspect_ratio = w / float(h + 1e-5)
                if 2.0 <= aspect_ratio <= 6.0 and w > 40 and h > 12:
                    return vehicle_img[y:y+h, x:x+w], [x, y, x+w, y+h]

        return None, None

    def process_vehicle_crop(
        self,
        vehicle_img: np.ndarray,
        track_id: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Runs ANPR on a vehicle crop.
        Maintains temporal voting per track_id across consecutive frames.
        Returns dict with plate_number, confidence, status, plate_crop, plate_bbox, or None if vehicle_img is empty.
        """
        if vehicle_img is None or vehicle_img.size == 0:
            return None

        # Return cached result if already firmly resolved for this track
        if track_id is not None and track_id in self.track_resolved:
            res = dict(self.track_resolved[track_id])
            if "plate_crop" not in res and track_id in self.track_plate_crops:
                res["plate_crop"] = self.track_plate_crops[track_id]
            if "plate_bbox" not in res and track_id in self.track_plate_bboxes:
                res["plate_bbox"] = self.track_plate_bboxes[track_id]
            return res

        plate_crop, plate_bbox = self._locate_plate(vehicle_img)
        if plate_crop is None:
            # Truthful: No plate detected on this frame
            return {
                "plate_number": "UNKNOWN",
                "confidence": 0.0,
                "status": "NOT_DETECTED",
                "plate_crop": None,
                "plate_bbox": None
            }

        # Cache plate crop if clear
        if track_id is not None:
            existing_crop = self.track_plate_crops.get(track_id)
            if existing_crop is None or (plate_crop.shape[1] > existing_crop.shape[1]):
                self.track_plate_crops[track_id] = plate_crop.copy()
                self.track_plate_bboxes[track_id] = plate_bbox

        # Preprocess plate crop
        preprocessed = self._preprocess_plate_crop(plate_crop)

        # Run OCR via PaddleOCR / EasyOCR fallback
        raw_text, confidence = self._run_ocr(preprocessed)

        # Clean alphanumeric characters (remove noise, whitespace, dashes)
        clean_text = re.sub(r'[^A-Z0-9]', '', raw_text.upper())

        # Validate typical plate format length (4 to 12 alphanumeric characters)
        if len(clean_text) < 4 or len(clean_text) > 12 or confidence < 0.25:
            # Unreadable plate
            if track_id is not None and self.track_votes[track_id]:
                # Fall back to best existing vote for this track if available
                best_text = max(self.track_votes[track_id], key=self.track_votes[track_id].get)
                total_conf = self.track_votes[track_id][best_text]
                return {
                    "plate_number": best_text,
                    "confidence": min(1.0, round(float(total_conf), 2)),
                    "status": "TRACK_VOTED",
                    "plate_crop": self.track_plate_crops.get(track_id, plate_crop),
                    "plate_bbox": self.track_plate_bboxes.get(track_id, plate_bbox)
                }

            return {
                "plate_number": "UNKNOWN",
                "confidence": round(float(confidence), 2),
                "status": "UNREADABLE",
                "plate_crop": plate_crop,
                "plate_bbox": plate_bbox
            }

        # Temporal Voting Accumulation
        if track_id is not None:
            self.track_votes[track_id][clean_text] += float(confidence)
            # Find candidate with highest accumulated score
            best_candidate = max(self.track_votes[track_id], key=self.track_votes[track_id].get)
            accum_score = self.track_votes[track_id][best_candidate]

            # If accumulated confidence >= 1.2 or single high-confidence >= 0.75, lock resolved
            status = "CONFIDENT" if confidence >= 0.65 or accum_score >= 1.2 else "LOW_CONFIDENCE"
            resolved_dict = {
                "plate_number": best_candidate,
                "confidence": round(min(1.0, float(confidence)), 2),
                "status": status,
                "plate_crop": self.track_plate_crops.get(track_id, plate_crop),
                "plate_bbox": self.track_plate_bboxes.get(track_id, plate_bbox)
            }

            if accum_score >= 1.5 or (confidence >= 0.80 and len(clean_text) >= 6):
                self.track_resolved[track_id] = resolved_dict

            return resolved_dict

        return {
            "plate_number": clean_text,
            "confidence": round(float(confidence), 2),
            "status": "CONFIDENT" if confidence >= 0.65 else "LOW_CONFIDENCE",
            "plate_crop": plate_crop,
            "plate_bbox": plate_bbox
        }

    def _run_ocr(self, crop: np.ndarray) -> tuple[str, float]:
        """Executes PaddleOCR (or EasyOCR fallback) on plate image crop."""
        if crop is None or crop.size == 0:
            return "", 0.0

        # 1. Primary Engine: PaddleOCR
        if hasattr(self, 'paddle_ocr') and self.paddle_ocr is not None:
            try:
                results = self.paddle_ocr.ocr(crop, cls=True)
                if results and results[0]:
                    texts = []
                    confs = []
                    for line in results[0]:
                        if line and len(line) >= 2:
                            txt, conf = line[1]
                            if txt and len(txt.strip()) > 0:
                                texts.append(txt)
                                confs.append(float(conf))
                    if texts:
                        full_text = "".join(texts)
                        avg_conf = sum(confs) / len(confs) if confs else 0.0
                        return full_text, avg_conf
            except Exception as e:
                logger.debug(f"PaddleOCR execution error ({e}). Trying EasyOCR fallback...")

        # 2. Secondary Fallback: EasyOCR
        if self.ocr_reader is not None:
            try:
                results = self.ocr_reader.readtext(
                    crop,
                    allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
                )
                if results:
                    texts = [res[1] for res in results]
                    confs = [float(res[2]) for res in results]
                    full_text = "".join(texts)
                    avg_conf = sum(confs) / len(confs) if confs else 0.0
                    return full_text, avg_conf
            except Exception as e:
                logger.debug(f"EasyOCR execution error: {e}")

        return "", 0.0

    def clean_track(self, track_id: int):
        """Cleans voting history for an expired track."""
        self.track_votes.pop(track_id, None)
        self.track_resolved.pop(track_id, None)
        self.track_plate_crops.pop(track_id, None)
        self.track_plate_bboxes.pop(track_id, None)
