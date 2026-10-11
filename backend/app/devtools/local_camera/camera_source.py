import sys
import cv2
import numpy as np
from typing import Tuple, Optional
from app.services.stream_service import VideoSource
from app.core.logging import logger

class LocalCameraSource(VideoSource):
    """
    Local physical or virtual camera video source for development & testing.
    Inherits from standard IBVAP VideoSource abstraction.
    """
    def __init__(self, device_index: int = 0):
        self.device_index = device_index
        self.cap: Optional[cv2.VideoCapture] = None

    def open(self) -> bool:
        backend_api = cv2.CAP_DSHOW if sys.platform.startswith("win") else cv2.CAP_ANY
        logger.info(f"[DevTools] Opening local camera source index #{self.device_index}...")
        self.cap = cv2.VideoCapture(self.device_index, backend_api)
        if not self.cap.isOpened():
            self.cap = cv2.VideoCapture(self.device_index)
        return self.cap.isOpened()

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        if not self.cap or not self.cap.isOpened():
            return False, None
        ret, frame = self.cap.read()
        return ret, frame

    def release(self) -> None:
        if self.cap:
            self.cap.release()
            self.cap = None
            logger.info(f"[DevTools] Released local camera source index #{self.device_index}.")
