"""Khai báo model dữ liệu cho API."""

from pydantic import BaseModel, Field


class ReferenceInfo(BaseModel):
    """Thông tin khuôn mặt tham chiếu; ví dụ: ReferenceInfo(reference_id='abc', label='An')."""

    reference_id: str = Field(..., description="ID duy nhất của khuôn mặt")
    label: str = Field(..., description="Tên hiển thị của khuôn mặt")
    image_path: str = Field(..., description="Đường dẫn ảnh tham chiếu")


class ApiMessage(BaseModel):
    """Thông báo API tổng quát; ví dụ: ApiMessage(message='ok')."""

    message: str


class BrowserRecognitionRequest(BaseModel):
    """Payload nhận diện từ webcam browser; ví dụ: BrowserRecognitionRequest(image_base64='data:image/jpeg;base64,...')."""

    image_base64: str = Field(..., min_length=32, description="Ảnh JPEG dạng data URL base64")
    reference_ids: list[str] = Field(default_factory=list, description="Danh sách ID khuôn mặt cần đối chiếu")


class FaceDetectionResult(BaseModel):
    """Kết quả nhận diện từng khuôn mặt; ví dụ: FaceDetectionResult(label='An', top=10, right=20, bottom=30, left=40, distance=0.33, is_match=True)."""

    label: str
    top: int
    right: int
    bottom: int
    left: int
    distance: float
    is_match: bool


class BrowserRecognitionResponse(BaseModel):
    """Kết quả nhận diện cho một frame webcam browser; ví dụ: BrowserRecognitionResponse(detections=[])."""

    detections: list[FaceDetectionResult]
