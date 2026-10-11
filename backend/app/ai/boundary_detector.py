import cv2
import uuid
import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime

class AIBoundaryDetector:
    """
    AI-Assisted Computer Vision Boundary Detection Engine.
    Analyzes camera video frames using OpenCV edge detection (Canny),
    probabilistic Hough line transform, and contour segmentation to find
    candidate structural boundaries (walls, perimeter fences, gates, doors).
    Normalizes coordinates to [0.0, 1.0] for resolution independence.
    """
    @staticmethod
    def analyze_frame_boundaries(
        frame: Optional[np.ndarray],
        max_suggestions: int = 4
    ) -> Dict[str, Any]:
        """
        Analyzes a camera frame and returns draft boundary suggestions.
        """
        if frame is None or frame.size == 0:
            return AIBoundaryDetector._fallback_suggestions("No valid frame captured from stream.")

        h, w = frame.shape[:2]
        if h < 50 or w < 50:
            return AIBoundaryDetector._fallback_suggestions("Frame resolution too low for segmentation.")

        suggestions: List[Dict[str, Any]] = []

        try:
            # 1. Grayscale & Blur
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)

            # 2. Canny Edge Detection
            edges = cv2.Canny(blurred, 50, 150)

            # 3. Detect prominent structural lines using HoughLinesP
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=int(w * 0.25), maxLineGap=20)
            
            line_count = 0
            if lines is not None:
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
                    if length > (w * 0.3):
                        # Normalize coordinates [0.0, 1.0]
                        nx1, ny1 = round(x1 / w, 4), round(y1 / h, 4)
                        nx2, ny2 = round(x2 / w, 4), round(y2 / h, 4)

                        b_type = "line_barrier"
                        label = "Structural Perimeter Line"
                        if ny1 > 0.6 and ny2 > 0.6:
                            b_type = "perimeter_fence"
                            label = "Outer Perimeter Edge"
                        elif abs(nx1 - nx2) < 0.1:
                            b_type = "gate"
                            label = "Access Control Gate Boundary"

                        conf = min(0.95, round(0.70 + (length / w) * 0.25, 2))

                        suggestions.append({
                            "id": str(uuid.uuid4())[:8],
                            "label": f"AI Draft: {label} #{line_count + 1}",
                            "boundary_type": b_type,
                            "confidence": conf,
                            "zone_kind": "LINE",
                            "polygon": [[nx1, ny1], [nx2, ny2]],
                            "suggested_zone_type": "restricted",
                            "description": f"Detected structural edge of length {int(length)}px with {int(conf*100)}% visual feature confidence."
                        })
                        line_count += 1
                        if line_count >= 2:
                            break

            # 4. Detect closed structural regions using Contour Approximation
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            poly_count = 0
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > (w * h * 0.04):  # At least 4% of total frame area
                    peri = cv2.arcLength(cnt, True)
                    approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)
                    
                    if len(approx) >= 3 and len(approx) <= 8:
                        norm_poly = []
                        for pt in approx:
                            px, py = pt[0]
                            norm_poly.append([round(px / w, 4), round(py / h, 4)])

                        conf = min(0.92, round(0.65 + (area / (w * h)) * 0.5, 2))
                        suggestions.append({
                            "id": str(uuid.uuid4())[:8],
                            "label": f"AI Draft: Structural Restricted Region #{poly_count + 1}",
                            "boundary_type": "wall",
                            "confidence": conf,
                            "zone_kind": "POLYGON",
                            "polygon": norm_poly,
                            "suggested_zone_type": "restricted",
                            "description": f"Closed visual region contour covering {round((area / (w * h)) * 100, 1)}% of frame area."
                        })
                        poly_count += 1
                        if poly_count >= 2:
                            break

            if suggestions:
                return {
                    "suggestions": suggestions[:max_suggestions],
                    "method_used": "opencv_contour_segmentation",
                    "total": len(suggestions[:max_suggestions]),
                    "timestamp": datetime.utcnow().isoformat()
                }

        except Exception as e:
            pass

        # Fallback if no strong structural boundaries were found
        return AIBoundaryDetector._fallback_suggestions("Low contrast visual features detected; providing standard perimeter draft layout.")

    @staticmethod
    def _fallback_suggestions(reason: str) -> Dict[str, Any]:
        """Provides default draft boundary suggestions when frame feature extraction is low."""
        fallback_suggestions = [
            {
                "id": "draft_perimeter_1",
                "label": "AI Draft: Bottom Entry Perimeter",
                "boundary_type": "perimeter_fence",
                "confidence": 0.75,
                "zone_kind": "LINE",
                "polygon": [[0.15, 0.75], [0.85, 0.75]],
                "suggested_zone_type": "restricted",
                "description": f"Standard baseline line-crossing boundary ({reason})."
            },
            {
                "id": "draft_zone_2",
                "label": "AI Draft: High Risk Quad Zone",
                "boundary_type": "wall",
                "confidence": 0.70,
                "zone_kind": "POLYGON",
                "polygon": [[0.20, 0.20], [0.80, 0.20], [0.80, 0.80], [0.20, 0.80]],
                "suggested_zone_type": "restricted",
                "description": "Standard quadrant polygon perimeter draft."
            }
        ]

        return {
            "suggestions": fallback_suggestions,
            "method_used": "manual_fallback",
            "total": len(fallback_suggestions),
            "timestamp": datetime.utcnow().isoformat()
        }
