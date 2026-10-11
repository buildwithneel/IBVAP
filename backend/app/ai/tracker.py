import numpy as np
from collections import Counter, deque
from typing import List, Dict, Any, Optional, Set

def bbox_to_z(b: List[float]) -> np.ndarray:
    """Converts [x1, y1, x2, y2] to decoupled linear measurement vector [xc, yc, w, h]."""
    w = max(1.0, float(b[2] - b[0]))
    h = max(1.0, float(b[3] - b[1]))
    xc = float(b[0]) + w / 2.0
    yc = float(b[1]) + h / 2.0
    return np.array([xc, yc, w, h], dtype=np.float32).reshape((4, 1))

def z_to_bbox(z: np.ndarray) -> List[float]:
    """Converts linear state vector [xc, yc, w, h, ...] to [x1, y1, x2, y2]."""
    xc = float(z[0, 0])
    yc = float(z[1, 0])
    w = max(1.0, float(z[2, 0]))
    h = max(1.0, float(z[3, 0]))
    return [round(xc - w / 2.0, 1), round(yc - h / 2.0, 1), round(xc + w / 2.0, 1), round(yc + h / 2.0, 1)]

def compute_iou(boxA: List[float], boxB: List[float]) -> float:
    """Computes Intersection-Over-Union between two bounding boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(1.0, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    areaB = max(1.0, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))
    return inter / float(areaA + areaB - inter + 1e-6)

class KalmanBoxTracker:
    """
    Decoupled 8-State Linear Kalman Filter for multi-object tracking.
    State: [xc, yc, w, h, v_xc, v_yc, v_w, v_h]
    Eliminates aspect-ratio noise amplification and prevents box jitter.
    """
    count = 0

    def __init__(self, bbox: List[float], class_name: str, confidence: float, category: Optional[str] = None, track_id: Optional[int] = None):
        self.F = np.eye(8, dtype=np.float32)
        for i in range(4):
            self.F[i, i + 4] = 1.0

        self.H = np.zeros((4, 8), dtype=np.float32)
        for i in range(4):
            self.H[i, i] = 1.0

        self.P = np.eye(8, dtype=np.float32) * 10.0
        self.Q = np.eye(8, dtype=np.float32) * 0.10
        self.Q[4:, 4:] *= 0.50
        self.R = np.eye(4, dtype=np.float32) * 1.0

        z = bbox_to_z(bbox)
        self.x = np.zeros((8, 1), dtype=np.float32)
        self.x[:4] = z

        if track_id is not None:
            self.id = track_id
        else:
            KalmanBoxTracker.count += 1
            self.id = KalmanBoxTracker.count

        self.category = category or class_name
        self.confidence = confidence
        self.hits = 1
        self.hit_streak = 1
        self.time_since_update = 0
        self.age = 0
        self.state = "TENTATIVE"  # TENTATIVE -> CONFIRMED

        # Sliding-window majority class voting
        self.class_votes = Counter()
        self.class_votes[class_name] += 1
        self.class_name = class_name

        # Last confirmed measurement box for smoothed rendering
        self.last_meas_bbox = list(bbox)

        # Re-ID / Appearance Feature Embedding Signature
        self.feature_signature: Optional[np.ndarray] = None

        self.centroid_history = deque(maxlen=45)
        self.centroid_history.append((float(z[0, 0]), float(z[1, 0])))

    def update_feature(self, feature: Optional[np.ndarray]):
        """Updates tracker appearance feature vector with exponential moving average."""
        if feature is None or feature.size == 0:
            return
        norm_feat = feature / (np.linalg.norm(feature) + 1e-6)
        if self.feature_signature is None:
            self.feature_signature = norm_feat
        else:
            self.feature_signature = 0.8 * self.feature_signature + 0.2 * norm_feat
            self.feature_signature /= (np.linalg.norm(self.feature_signature) + 1e-6)

    def predict(self) -> List[float]:
        """Advances state vector using constant velocity model and returns predicted bbox."""
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        self.age += 1
        self.time_since_update += 1
        return z_to_bbox(self.x)

    def update(self, bbox: List[float], confidence: float, class_name: str):
        """Updates state vector with observed measurement and updates class voting."""
        self.time_since_update = 0
        self.hits += 1
        self.hit_streak += 1
        self.confidence = confidence
        self.last_meas_bbox = list(bbox)

        # Update majority class
        self.class_votes[class_name] += 1
        self.class_name = self.class_votes.most_common(1)[0][0]

        if self.hits >= 2:
            self.state = "CONFIRMED"

        z = bbox_to_z(bbox)
        y = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        self.P = (np.eye(8, dtype=np.float32) - K @ self.H) @ self.P

        xc = float(self.x[0, 0])
        yc = float(self.x[1, 0])
        self.centroid_history.append((xc, yc))

    def get_current_bbox(self) -> List[float]:
        """
        Returns smoothed bounding box: 75% detector measurement + 25% Kalman prediction.
        Eliminates 1-2px jitter while remaining responsive with zero lag.
        """
        if self.time_since_update > 0:
            # Coasting: use pure Kalman prediction
            return z_to_bbox(self.x)

        pred_box = z_to_bbox(self.x)
        meas_box = self.last_meas_bbox
        smoothed = [
            round(0.75 * meas_box[i] + 0.25 * pred_box[i], 1)
            for i in range(4)
        ]
        return smoothed

    def get_displacement(self, window: int = 10) -> float:
        """Calculates Euclidean centroid displacement over the last window frames."""
        if len(self.centroid_history) < 2:
            return 0.0
        curr_x, curr_y = self.centroid_history[-1]
        idx = max(0, len(self.centroid_history) - 1 - window)
        past_x, past_y = self.centroid_history[idx]
        return float(np.sqrt((curr_x - past_x) ** 2 + (curr_y - past_y) ** 2))

    def get_velocity(self) -> float:
        """Instantaneous velocity in pixels per frame from Kalman filter state."""
        vx = float(self.x[4, 0])
        vy = float(self.x[5, 0])
        return float(np.sqrt(vx ** 2 + vy ** 2))

    def has_moved(self, min_displacement: float = 25.0, window: int = 10) -> bool:
        """Movement test: True ONLY if Euclidean displacement over recent window >= min_displacement."""
        return self.get_displacement(window=window) >= min_displacement


class ByteTracker:
    """
    Robust Multi-Object Tracker with:
    1. Linear decoupled Kalman filter state (no aspect-ratio jitter).
    2. Category-compatible association matching (prevents class-jump track loss).
    3. Majority-vote class consistency.
    4. Two-tier ByteTrack matching (high and low confidence recovery).
    5. Track confirmation lifecycle (Tentative -> Confirmed).
    6. Coasting memory during momentary detector dropouts (Anti-Flicker).
    """
    def __init__(
        self,
        max_age: int = 30,
        max_coast_frames: int = 3,
        high_threshold: float = 0.20,
        low_threshold: float = 0.08,
        two_wheeler_threshold: float = 0.12,
        iou_threshold: float = 0.20
    ):
        self.max_age = max_age
        self.max_coast_frames = max_coast_frames
        self.high_threshold = high_threshold
        self.low_threshold = low_threshold
        self.two_wheeler_threshold = two_wheeler_threshold
        self.iou_threshold = iou_threshold
        self.trackers: List[KalmanBoxTracker] = []
        self._next_id: int = 1
        self.unique_person_ids: Set[int] = set()
        self.unique_vehicle_ids: Set[int] = set()

    def get_next_id(self) -> int:
        tid = self._next_id
        self._next_id += 1
        return tid

    def reset(self, keep_stats: bool = False):
        """Resets active tracker state on video loop or session restart."""
        self.trackers = []
        self._next_id = 1
        if not keep_stats:
            self.unique_person_ids.clear()
            self.unique_vehicle_ids.clear()

    @property
    def person_count(self) -> int:
        return len(self.unique_person_ids)

    @property
    def vehicle_count(self) -> int:
        return len(self.unique_vehicle_ids)

    def _record_unique_object(self, trk: KalmanBoxTracker):
        """Records unique object identification for person and vehicle categories."""
        cname = (trk.class_name or "").lower()
        if cname == 'person':
            self.unique_person_ids.add(trk.id)
        elif cname in ['car', 'truck', 'bus', 'motorcycle']:
            self.unique_vehicle_ids.add(trk.id)

    def update(self, detections: List[Dict[str, Any]], frame: Optional[np.ndarray] = None) -> List[Dict[str, Any]]:
        """
        Updates active tracks with incoming frame detections.
        Supports optional frame image for Re-ID feature extraction and occlusion recovery.
        Returns stabilized detections with track_id, velocity, displacement, and coasting state.
        """
        # Extract appearance features if frame is provided
        if frame is not None and frame.size > 0:
            from app.ai.reid import PersonReIDExtractor
            extractor = PersonReIDExtractor()
            h_frame, w_frame = frame.shape[:2]
            for det in detections:
                if 'feature' not in det:
                    b = det['bbox']
                    x1, y1, x2, y2 = int(max(0, b[0])), int(max(0, b[1])), int(min(w_frame, b[2])), int(min(h_frame, b[3]))
                    if (y2 - y1) >= 20 and (x2 - x1) >= 15:
                        crop = frame[y1:y2, x1:x2]
                        det['feature'] = extractor.extract_features(crop)

        # Step 1: Predict positions for all existing trackers
        for trk in self.trackers:
            trk.predict()

        if not detections:
            # Even with no detections, coast confirmed tracks for up to max_coast_frames
            coasting_outs = []
            for trk in self.trackers:
                if trk.state == "CONFIRMED" and trk.time_since_update <= self.max_coast_frames:
                    coasting_outs.append(self._format_track_output(trk, is_coasting=True))
            self.trackers = [t for t in self.trackers if t.time_since_update <= self.max_age]
            return coasting_outs

        # Step 2: Split detections into high and low confidence groups
        high_dets = []
        high_indices = []
        low_dets = []
        low_indices = []

        for idx, det in enumerate(detections):
            conf = det.get('confidence', 0.0)
            is_two_w = det.get('category') == 'two_wheeler' or det.get('class_name') in ['motorcycle', 'bicycle']
            req_init = self.two_wheeler_threshold if is_two_w else self.high_threshold
            if conf >= req_init:
                high_dets.append(det)
                high_indices.append(idx)
            elif conf >= self.low_threshold:
                low_dets.append(det)
                low_indices.append(idx)

        unmatched_track_indices = list(range(len(self.trackers)))
        matched_high_dets = set()
        matched_track_indices = set()

        # Step 3: Match high-confidence detections with active tracks using IoU & Feature Similarity
        if unmatched_track_indices and high_dets:
            matched_trk_idx, matched_det_idx = self._associate(
                unmatched_track_indices, high_dets, self.iou_threshold
            )
            for t_idx, d_local_idx in zip(matched_trk_idx, matched_det_idx):
                det_orig_idx = high_indices[d_local_idx]
                trk = self.trackers[t_idx]
                det = detections[det_orig_idx]
                trk.update(det['bbox'], det['confidence'], det['class_name'])
                if det.get('feature') is not None:
                    trk.update_feature(det['feature'])
                self._record_unique_object(trk)
                self._enrich_detection(det, trk, is_coasting=False)
                matched_high_dets.add(d_local_idx)
                matched_track_indices.add(t_idx)

            unmatched_track_indices = [
                i for i in unmatched_track_indices if i not in matched_track_indices
            ]

        # Step 4: Match remaining unmatched tracks with low-confidence detections (recovers dropouts)
        if unmatched_track_indices and low_dets:
            matched_trk_idx_low, matched_det_idx_low = self._associate(
                unmatched_track_indices, low_dets, self.iou_threshold * 0.8
            )
            for t_idx, d_local_idx in zip(matched_trk_idx_low, matched_det_idx_low):
                det_orig_idx = low_indices[d_local_idx]
                trk = self.trackers[t_idx]
                det = detections[det_orig_idx]
                trk.update(det['bbox'], det['confidence'], det['class_name'])
                if det.get('feature') is not None:
                    trk.update_feature(det['feature'])
                self._record_unique_object(trk)
                self._enrich_detection(det, trk, is_coasting=False)
                matched_track_indices.add(t_idx)

            unmatched_track_indices = [
                i for i in unmatched_track_indices if i not in matched_track_indices
            ]

        # Step 4.5: Feature Appearance Recovery for Coasting Targets
        # Re-associates unmatched high-confidence detections to coasted tracks (time_since_update > 0)
        if unmatched_track_indices:
            from app.ai.reid import PersonReIDExtractor
            unmatched_high_locals = [d_idx for d_idx in range(len(high_dets)) if d_idx not in matched_high_dets]
            for d_local in unmatched_high_locals:
                det = high_dets[d_local]
                det_feat = det.get('feature')
                if det_feat is None:
                    continue

                best_t_idx = None
                best_sim = 0.72  # Minimum similarity threshold for occlusion recovery

                for t_idx in unmatched_track_indices:
                    trk = self.trackers[t_idx]
                    if trk.time_since_update > 0 and trk.feature_signature is not None:
                        # Category check
                        det_cat = det.get('category', det['class_name'])
                        if trk.category == det_cat:
                            sim = PersonReIDExtractor.compute_similarity(det_feat, trk.feature_signature)
                            if sim > best_sim:
                                best_sim = sim
                                best_t_idx = t_idx

                if best_t_idx is not None:
                    det_orig_idx = high_indices[d_local]
                    trk = self.trackers[best_t_idx]
                    trk.update(det['bbox'], det['confidence'], det['class_name'])
                    trk.update_feature(det_feat)
                    self._enrich_detection(det, trk, is_coasting=False)
                    matched_high_dets.add(d_local)
                    matched_track_indices.add(best_t_idx)
                    unmatched_track_indices.remove(best_t_idx)

        # Step 5: Initialize new tracks for unmatched high-confidence detections
        for d_local_idx, det_orig_idx in enumerate(high_indices):
            if d_local_idx not in matched_high_dets:
                det = detections[det_orig_idx]
                new_trk = KalmanBoxTracker(
                    det['bbox'],
                    det['class_name'],
                    det['confidence'],
                    det.get('category'),
                    track_id=self.get_next_id()
                )
                if det.get('feature') is not None:
                    new_trk.update_feature(det['feature'])
                self.trackers.append(new_trk)
                self._record_unique_object(new_trk)
                self._enrich_detection(det, new_trk, is_coasting=False)

        # Step 6: Build final output list:
        # Include all matched detections
        output_detections = [d for d in detections if 'track_id' in d]

        # AND Coast confirmed tracks that missed detection this frame
        for t_idx in unmatched_track_indices:
            trk = self.trackers[t_idx]
            if trk.state == "CONFIRMED" and trk.time_since_update <= self.max_coast_frames:
                output_detections.append(self._format_track_output(trk, is_coasting=True))

        # Step 7: Prune dead tracks beyond max_age
        self.trackers = [t for t in self.trackers if t.time_since_update <= self.max_age]

        return output_detections

    def _associate(
        self,
        track_indices: List[int],
        dets: List[Dict[str, Any]],
        iou_thresh: float
    ) -> tuple[List[int], List[int]]:
        """IoU association respecting category compatibility."""
        if not track_indices or not dets:
            return [], []

        cost_matrix = np.zeros((len(track_indices), len(dets)), dtype=np.float32)
        for i, t_idx in enumerate(track_indices):
            trk = self.trackers[t_idx]
            trk_box = trk.get_current_bbox()
            for j, det in enumerate(dets):
                # Category compatibility check (four_wheeler <-> four_wheeler, etc.)
                det_cat = det.get('category', det['class_name'])
                if trk.category != det_cat:
                    cost_matrix[i, j] = 0.0
                else:
                    cost_matrix[i, j] = compute_iou(trk_box, det['bbox'])

        matched_tracks = []
        matched_dets = []

        while True:
            if cost_matrix.size == 0:
                break
            max_val = np.max(cost_matrix)
            if max_val < iou_thresh:
                break
            max_idx = np.unravel_index(np.argmax(cost_matrix), cost_matrix.shape)
            r, c = max_idx
            matched_tracks.append(track_indices[r])
            matched_dets.append(c)

            cost_matrix[r, :] = -1.0
            cost_matrix[:, c] = -1.0

        return matched_tracks, matched_dets

    def _enrich_detection(self, det: Dict[str, Any], trk: KalmanBoxTracker, is_coasting: bool = False):
        """Augments detection dict with tracker state."""
        det['track_id'] = trk.id
        det['class_name'] = trk.class_name  # Stabilized majority class
        det['bbox'] = trk.get_current_bbox()
        det['velocity'] = round(trk.get_velocity(), 2)
        det['displacement_10f'] = round(trk.get_displacement(window=10), 2)
        det['has_moved'] = trk.has_moved(min_displacement=25.0, window=10)
        det['track_state'] = trk.state
        det['is_coasting'] = is_coasting

    def _format_track_output(self, trk: KalmanBoxTracker, is_coasting: bool = True) -> Dict[str, Any]:
        """Constructs detection output for coasting tracks."""
        decay = max(0.40, 1.0 - (trk.time_since_update * 0.05))
        return {
            'track_id': trk.id,
            'class_name': trk.class_name,
            'category': trk.category,
            'confidence': round(trk.confidence * decay, 4),
            'bbox': trk.get_current_bbox(),
            'velocity': round(trk.get_velocity(), 2),
            'displacement_10f': round(trk.get_displacement(window=10), 2),
            'has_moved': trk.has_moved(min_displacement=25.0, window=10),
            'track_state': trk.state,
            'is_coasting': is_coasting
        }

# Backward compatibility alias
SimpleByteTracker = ByteTracker
