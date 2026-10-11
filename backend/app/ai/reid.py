import cv2
import numpy as np
import threading
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from app.core.logging import logger

class PersonReIDExtractor:
    """
    Appearance Feature Extractor for Cross-Camera Person Re-Identification.
    Combines:
    1. Deep CNN visual representation (MobileNetV3-Small backbone, 576-dim L2 normalized).
    2. Spatial color histogram signature (Upper/Lower torso HSV chromatic distribution, 64-dim).
    Operates in real-time (~5-10ms per person crop on CPU).
    """
    def __init__(self):
        self.device = "cpu"
        self.model = None
        self._init_model()

    def _init_model(self):
        try:
            import torch
            import torchvision.models as models
            logger.info("Initializing MobileNetV3 Person Re-ID feature extractor...")
            self.model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
            # Remove classification head to output pooled 576-dim embedding
            self.model.classifier = torch.nn.Identity()
            self.model.eval()
            logger.info("MobileNetV3 Re-ID feature extractor initialized.")
        except Exception as e:
            logger.warning(f"Could not load MobileNetV3 for Re-ID ({e}). Operating in histogram mode.")
            self.model = None

    def _extract_color_signature(self, bgr_crop: np.ndarray) -> np.ndarray:
        """
        Extracts two-part HSV color histograms: upper body (0-50% height) and lower body (50-100% height).
        Yields 64-dim color signature resistant to camera angle changes.
        """
        h, w = bgr_crop.shape[:2]
        h_mid = max(1, h // 2)

        upper_crop = bgr_crop[:h_mid, :]
        lower_crop = bgr_crop[h_mid:, :]

        hsv_upper = cv2.cvtColor(upper_crop, cv2.COLOR_BGR2HSV)
        hsv_lower = cv2.cvtColor(lower_crop, cv2.COLOR_BGR2HSV)

        # 8 bins for Hue, 4 bins for Saturation = 32 bins per half
        hist_upper = cv2.calcHist([hsv_upper], [0, 1], None, [8, 4], [0, 180, 0, 256])
        hist_lower = cv2.calcHist([hsv_lower], [0, 1], None, [8, 4], [0, 180, 0, 256])

        hist_upper = cv2.normalize(hist_upper, hist_upper).flatten()
        hist_lower = cv2.normalize(hist_lower, hist_lower).flatten()

        color_sig = np.concatenate([hist_upper, hist_lower])
        norm = np.linalg.norm(color_sig) + 1e-6
        return color_sig / norm

    def extract_features(self, person_bgr: np.ndarray) -> Optional[np.ndarray]:
        """
        Extracts combined normalized feature vector from a person bounding box crop.
        Returns 1D numpy array of shape (640,) or None if crop is invalid.
        """
        if person_bgr is None or person_bgr.size == 0:
            return None

        h, w = person_bgr.shape[:2]
        if h < 32 or w < 24:
            # Insufficient resolution for reliable feature extraction
            return None

        # 1. Color signature (64-dim)
        color_feat = self._extract_color_signature(person_bgr)

        # 2. Deep CNN visual embedding (576-dim)
        deep_feat = None
        if self.model is not None:
            try:
                import torch
                # Resize and normalize for ImageNet
                img_resized = cv2.resize(person_bgr, (224, 224))
                img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
                # Mean and std normalization
                mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
                std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
                img_tensor = (img_rgb - mean) / std
                img_tensor = np.transpose(img_tensor, (2, 0, 1))  # (3, 224, 224)
                img_tensor = torch.from_numpy(img_tensor).unsqueeze(0)  # (1, 3, 224, 224)

                with torch.no_grad():
                    feat = self.model(img_tensor)
                    feat_np = feat.squeeze(0).cpu().numpy()
                    norm = np.linalg.norm(feat_np) + 1e-6
                    deep_feat = feat_np / norm
            except Exception as e:
                logger.error(f"Error during deep Re-ID feature extraction: {e}")
                deep_feat = None

        if deep_feat is not None:
            # Weighted combination: 0.7 deep visual + 0.3 spatial chromatic
            combined = np.concatenate([deep_feat * 0.7, color_feat * 0.3])
        else:
            combined = color_feat

        norm = np.linalg.norm(combined) + 1e-6
        return combined / norm

    @staticmethod
    def compute_similarity(feat1: np.ndarray, feat2: np.ndarray) -> float:
        """Computes Cosine Similarity between two feature vectors in range [-1.0, 1.0]."""
        if feat1 is None or feat2 is None:
            return 0.0
        return float(np.dot(feat1, feat2) / (np.linalg.norm(feat1) * np.linalg.norm(feat2) + 1e-6))


class GlobalIdentityManager:
    """
    Cross-Camera Global Person Identity Registry.
    Maintains:
    - Global Person ID gallery: P-0001, P-0002, ...
    - Feature centroid representations for each global person.
    - Camera sighting history and timestamps.
    - Local track to global ID mapping cache: (camera_id, local_track_id) -> global_id.
    """
    def __init__(self, similarity_threshold: float = 0.84):
        self.similarity_threshold = similarity_threshold
        self.lock = threading.Lock()
        self.extractor = PersonReIDExtractor()

        self.next_global_idx = 1
        # global_id -> { "embedding": np.ndarray, "cameras": set(), "first_seen": dt, "last_seen": dt, "count": int }
        self.gallery: Dict[str, Dict[str, Any]] = {}

        # (camera_id, local_track_id) -> { "global_id": str, "similarity": float, "last_updated": dt, "update_count": int }
        self.local_mappings: Dict[Tuple[str, int], Dict[str, Any]] = {}

    def identify_or_register(
        self,
        camera_id: str,
        local_track_id: int,
        person_crop: Optional[np.ndarray],
        force_recompute: bool = False
    ) -> Tuple[Optional[str], float, bool]:
        """
        Matches a local track to an existing Global Person ID or registers a new identity.
        Returns: (global_id, similarity_score, is_new_identity)
        If person_crop is unavailable/unusable and no cached mapping exists, returns (None, 0.0, False).
        """
        key = (camera_id, local_track_id)
        now = datetime.now(timezone.utc)

        with self.lock:
            # Check if this local track already has a firm global mapping
            if not force_recompute and key in self.local_mappings:
                cached = self.local_mappings[key]
                cached["last_updated"] = now
                cached["update_count"] += 1
                gid = cached["global_id"]
                if gid in self.gallery:
                    self.gallery[gid]["cameras"].add(camera_id)
                    self.gallery[gid]["last_seen"] = now
                    self.gallery[gid]["count"] += 1
                return gid, cached["similarity"], False

            if person_crop is None or person_crop.size == 0:
                # Cannot extract feature
                return None, 0.0, False

            # Extract appearance feature vector
            features = self.extractor.extract_features(person_crop)
            if features is None:
                return None, 0.0, False

            # Search gallery for best cosine match
            best_gid = None
            best_sim = -1.0

            for gid, profile in self.gallery.items():
                sim = self.extractor.compute_similarity(features, profile["embedding"])
                if sim > best_sim:
                    best_sim = sim
                    best_gid = gid

            if best_sim >= self.similarity_threshold and best_gid is not None:
                # Matched existing global identity!
                profile = self.gallery[best_gid]
                profile["cameras"].add(camera_id)
                profile["last_seen"] = now
                profile["count"] += 1
                # Smooth embedding moving average (alpha=0.2)
                profile["embedding"] = 0.8 * profile["embedding"] + 0.2 * features
                profile["embedding"] /= (np.linalg.norm(profile["embedding"]) + 1e-6)

                self.local_mappings[key] = {
                    "global_id": best_gid,
                    "similarity": round(best_sim, 3),
                    "last_updated": now,
                    "update_count": 1
                }
                logger.info(f"Re-ID Match: Track {local_track_id} on Camera {camera_id} matched {best_gid} (Sim: {best_sim:.3f})")
                return best_gid, round(best_sim, 3), False

            else:
                # Register new Global Person ID
                new_gid = f"P-{self.next_global_idx:04d}"
                self.next_global_idx += 1

                self.gallery[new_gid] = {
                    "global_id": new_gid,
                    "embedding": features,
                    "cameras": {camera_id},
                    "first_seen": now,
                    "last_seen": now,
                    "count": 1
                }

                sim_to_return = 1.0 if best_sim < 0 else round(best_sim, 3)
                self.local_mappings[key] = {
                    "global_id": new_gid,
                    "similarity": sim_to_return,
                    "last_updated": now,
                    "update_count": 1
                }
                logger.info(f"Re-ID Registered: Track {local_track_id} on Camera {camera_id} as new {new_gid}")
                return new_gid, 1.0, True

    def get_gallery_summary(self) -> List[Dict[str, Any]]:
        """Returns snapshot of all tracked global persons and camera sightings."""
        with self.lock:
            result = []
            for gid, data in self.gallery.items():
                result.append({
                    "global_id": gid,
                    "cameras": list(data["cameras"]),
                    "camera_count": len(data["cameras"]),
                    "first_seen": data["first_seen"].isoformat(),
                    "last_seen": data["last_seen"].isoformat(),
                    "total_detections": data["count"]
                })
            return result

    def reset(self):
        """Cleans gallery and local mappings."""
        with self.lock:
            self.next_global_idx = 1
            self.gallery.clear()
            self.local_mappings.clear()

# Global Singleton instance
global_identity_manager = GlobalIdentityManager()
