import cv2
import numpy as np
from abc import ABC, abstractmethod
from typing import Optional, Tuple
from app.core.logging import logger

class VideoSource(ABC):
    @abstractmethod
    def open(self) -> bool:
        pass

    @abstractmethod
    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        pass

    @abstractmethod
    def release(self) -> None:
        pass

class FileVideoSource(VideoSource):
    def __init__(self, file_path: str, loop: bool = True):
        self.file_path = file_path
        self.loop = loop
        self.cap: Optional[cv2.VideoCapture] = None
        self.has_looped: bool = False

    def open(self) -> bool:
        logger.info(f"Opening video file source: '{self.file_path}' (loop={self.loop})")
        self.cap = cv2.VideoCapture(self.file_path)
        self.has_looped = False
        return self.cap.isOpened()

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        if not self.cap or not self.cap.isOpened():
            return False, None
        ret, frame = self.cap.read()
        if (not ret or frame is None) and self.loop:
            # Loop continuously back to beginning of video file
            self.has_looped = True
            logger.info(f"Video '{self.file_path}' reached EOF. Rewinding to frame 0 (loop playback).")
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()
        return ret, frame

    def check_and_clear_loop(self) -> bool:
        if self.has_looped:
            self.has_looped = False
            return True
        return False

    def seek_to_start(self) -> bool:
        if self.cap and self.cap.isOpened():
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            self.has_looped = False
            return True
        return False

    def release(self) -> None:
        if self.cap:
            self.cap.release()
            self.cap = None
        self.has_looped = False

class WebcamVideoSource(VideoSource):
    def __init__(self, device_index: int = 0):
        self.device_index = device_index
        self.cap: Optional[cv2.VideoCapture] = None

    def open(self) -> bool:
        logger.info(f"Opening webcam source device index: {self.device_index}")
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

class RTSPVideoSource(VideoSource):
    def __init__(self, rtsp_url: str):
        self.rtsp_url = rtsp_url
        self.cap: Optional[cv2.VideoCapture] = None

    def open(self) -> bool:
        logger.info(f"Connecting to RTSP stream: '{self.rtsp_url}'")
        self.cap = cv2.VideoCapture(self.rtsp_url)
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

def create_video_source(source_type: str, source_url: str, loop: bool = True) -> VideoSource:
    source_type_lower = source_type.lower()
    if source_type_lower in ["file", "simulated"]:
        return FileVideoSource(source_url, loop=loop)
    elif source_type_lower == "webcam":
        try:
            device_idx = int(source_url)
        except ValueError:
            device_idx = 0
        return WebcamVideoSource(device_idx)
    elif source_type_lower in ["rtsp", "onvif"]:
        return RTSPVideoSource(source_url)
    else:
        # Default fallback
        return FileVideoSource(source_url, loop=loop)
