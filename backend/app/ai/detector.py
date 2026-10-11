import os
import cv2
import numpy as np
from typing import List, Dict, Any, Optional
from app.core.config import settings
from app.core.logging import logger

def compute_box_iou(boxA: List[float], boxB: List[float]) -> float:
    """Computes IoU between two [x1, y1, x2, y2] bounding boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(1.0, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    areaB = max(1.0, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))
    return inter / float(areaA + areaB - inter + 1e-6)

import threading

class YOLODetector:
    _cached_model = None
    _cached_model_path = None
    _lock = threading.Lock()

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or settings.YOLO_MODEL_PATH
        self.conf_threshold = settings.YOLO_CONFIDENCE_THRESHOLD
        self.two_wheeler_conf_threshold = getattr(settings, 'YOLO_TWO_WHEELER_CONFIDENCE_THRESHOLD', 0.12)
        self.iou_threshold = settings.YOLO_IOU_THRESHOLD
        self.device = settings.YOLO_DEVICE
        self.model = None
        self._load_model()

    def _load_model(self):
        with YOLODetector._lock:
            if YOLODetector._cached_model is not None and YOLODetector._cached_model_path == self.model_path:
                self.model = YOLODetector._cached_model
                return

            try:
                from ultralytics import YOLO
                logger.info(f"Loading YOLO model from '{self.model_path}' on device '{self.device}'...")
                self.model = YOLO(self.model_path)
                YOLODetector._cached_model = self.model
                YOLODetector._cached_model_path = self.model_path
                logger.info("YOLO Model loaded successfully.")
            except Exception as e:
                logger.warning(f"Could not load YOLO model from '{self.model_path}': {e}. Attempting default yolov8n.pt...")
                try:
                    from ultralytics import YOLO
                    self.model = YOLO("yolov8n.pt")
                    YOLODetector._cached_model = self.model
                    YOLODetector._cached_model_path = "yolov8n.pt"
                    logger.info("Loaded default yolov8n.pt model.")
                except Exception as ex:
                    logger.error(f"Failed to load any YOLO model: {ex}")
                    self.model = None

    _predict_lock = threading.Lock()

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Runs object detection on a BGR image frame.
        Applies calibrated per-category confidence thresholds and intra-category duplicate suppression.
        """
        if self.model is None or frame is None or frame.size == 0:
            return []

        height, width = frame.shape[:2]

        # Use the lowest required threshold for model predict to avoid early dropout of two-wheelers
        predict_conf = min(self.conf_threshold, self.two_wheeler_conf_threshold)

        with YOLODetector._predict_lock:
            results = self.model.predict(
                source=frame,
                conf=predict_conf,
                iou=self.iou_threshold,
                device=self.device,
                verbose=False
            )

        if not results:
            return []

        raw_candidates = []
        target_classes = {"person", "car", "motorcycle", "bus", "truck", "bicycle"}
        animal_classes = {"cow", "horse", "sheep"}

        for r in results:
            boxes = r.boxes
            if boxes is None:
                continue
            for box in boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                cls_name = self.model.names[cls_id] if hasattr(self.model, 'names') else str(cls_id)
                cls_name_lower = cls_name.lower()

                coords = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                # Clip to frame boundary
                x1 = max(0.0, min(float(width), coords[0]))
                y1 = max(0.0, min(float(height), coords[1]))
                x2 = max(0.0, min(float(width), coords[2]))
                y2 = max(0.0, min(float(height), coords[3]))
                clipped_box = [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]

                # Calibrated class thresholds
                if cls_name_lower in {"motorcycle", "bicycle"}:
                    if conf >= self.two_wheeler_conf_threshold:
                        raw_candidates.append({
                            "class_name": cls_name_lower,
                            "category": "two_wheeler",
                            "confidence": round(conf, 4),
                            "bbox": clipped_box,
                            "class_id": cls_id
                        })
                elif cls_name_lower == "person":
                    if conf >= self.conf_threshold:
                        raw_candidates.append({
                            "class_name": cls_name_lower,
                            "category": "person",
                            "confidence": round(conf, 4),
                            "bbox": clipped_box,
                            "class_id": cls_id
                        })
                elif cls_name_lower in {"car", "truck", "bus"}:
                    if conf >= max(0.24, self.conf_threshold):
                        raw_candidates.append({
                            "class_name": cls_name_lower,
                            "category": "four_wheeler",
                            "confidence": round(conf, 4),
                            "bbox": clipped_box,
                            "class_id": cls_id
                        })
                elif cls_name_lower in animal_classes:
                    if conf >= 0.25:
                        raw_candidates.append({
                            "class_name": "animal",
                            "subtype": cls_name_lower,
                            "category": "non_standard_transport",
                            "confidence": round(conf, 4),
                            "bbox": clipped_box,
                            "class_id": cls_id,
                            "classification_note": f"MODEL-LIMITED (Detected as {cls_name_lower}; non-standard carriage/bullock cart not in COCO taxonomy)"
                        })

        # Intra-category duplicate suppression:
        # If two four-wheelers (car/truck/bus) overlap with IoU >= 0.52, keep highest confidence box.
        # DO NOT suppress two-wheelers or persons against each other or against cars!
        four_wheelers = [d for d in raw_candidates if d["category"] == "four_wheeler"]
        other_objects = [d for d in raw_candidates if d["category"] != "four_wheeler"]

        four_wheelers.sort(key=lambda d: d["confidence"], reverse=True)
        kept_four_wheelers = []
        for d in four_wheelers:
            boxA = d["bbox"]
            duplicate = False
            for kept in kept_four_wheelers:
                if compute_box_iou(boxA, kept["bbox"]) >= 0.52:
                    duplicate = True
                    break
            if not duplicate:
                kept_four_wheelers.append(d)

        return kept_four_wheelers + other_objects
