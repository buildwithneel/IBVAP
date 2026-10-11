import cv2
import numpy as np
from typing import List, Dict, Any
from app.core.logging import logger

class FaceDetector:
    """
    Real Face Detector using OpenCV Cascade Classifier.
    Detects face bounding boxes ONLY without identity guessing or fake recognition.
    Resilient to headless OpenCV builds where CascadeClassifier may be absent.
    """
    def __init__(self):
        self.face_cascade = None
        self._init_cascade()

    def _init_cascade(self):
        try:
            if hasattr(cv2, 'CascadeClassifier') and hasattr(cv2, 'data'):
                cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
                self.face_cascade = cv2.CascadeClassifier(cascade_path)
                if self.face_cascade.empty():
                    self.face_cascade = None
        except Exception as e:
            logger.warning(f"Face cascade initialization skipped: {e}")
            self.face_cascade = None

    def detect_faces(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detects faces in BGR image frame.
        Returns list of face detection objects:
        [
          {
            "class_name": "face",
            "confidence": 0.92,
            "bbox": [x1, y1, x2, y2]
          }
        ]
        """
        if frame is None or self.face_cascade is None:
            return []

        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            results = []

            # Use detectMultiScale3 if available to get actual classifier level weights
            if hasattr(self.face_cascade, 'detectMultiScale3'):
                faces, reject_levels, level_weights = self.face_cascade.detectMultiScale3(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=5,
                    minSize=(30, 30),
                    outputRejectLevels=True
                )
                for i, (x, y, w, h) in enumerate(faces):
                    weight = float(level_weights[i]) if i < len(level_weights) else 5.0
                    conf = min(0.98, max(0.50, round(weight / (weight + 3.0), 2)))
                    results.append({
                        "class_name": "face",
                        "confidence": conf,
                        "bbox": [float(x), float(y), float(x + w), float(y + h)],
                        "detection_type": "face_detection_only",
                        "identity": None,
                        "disclaimer": "Face Detection Only — No Identity Recognition"
                    })
            else:
                faces = self.face_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=5,
                    minSize=(30, 30)
                )
                for (x, y, w, h) in faces:
                    results.append({
                        "class_name": "face",
                        "confidence": 0.75,
                        "bbox": [float(x), float(y), float(x + w), float(y + h)],
                        "detection_type": "face_detection_only",
                        "identity": None,
                        "disclaimer": "Face Detection Only — No Identity Recognition"
                    })

            return results
        except Exception as e:
            logger.error(f"Face detection execution error: {e}")
            return []
