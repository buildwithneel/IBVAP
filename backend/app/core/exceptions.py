from fastapi import HTTPException, status

class AIModelNotFoundError(HTTPException):
    def __init__(self, model_path: str):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Detection Model not found at specified path: '{model_path}'. Please configure YOLO_MODEL_PATH correctly."
        )

class CameraNotFoundError(HTTPException):
    def __init__(self, camera_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with ID '{camera_id}' was not found."
        )

class StreamError(HTTPException):
    def __init__(self, message: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stream error: {message}"
        )
