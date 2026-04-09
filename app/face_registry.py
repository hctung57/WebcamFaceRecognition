"""Quản lý ảnh khuôn mặt tham chiếu và embedding."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

import face_recognition
import numpy as np
from fastapi import HTTPException, UploadFile

from app.models import ReferenceInfo


@dataclass(slots=True)
class ReferenceFace:
    """Thông tin khuôn mặt nội bộ; ví dụ: ReferenceFace(reference_id='id', label='An', image_path='x.jpg', encoding=np.zeros(128))."""

    reference_id: str
    label: str
    image_path: str
    encoding: np.ndarray


class FaceRegistry:
    """Registry quản lý khuôn mặt tham chiếu; ví dụ: registry = FaceRegistry(Path('data/references'))."""

    def __init__(self, storage_dir: Path) -> None:
        """Khởi tạo thư mục lưu ảnh tham chiếu; ví dụ: FaceRegistry(Path('data/references'))."""

        self.storage_dir: Path = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._faces: dict[str, ReferenceFace] = {}

    def load_existing_references(self) -> int:
        """Nạp lại ảnh tham chiếu đã có trên đĩa; ví dụ: registry.load_existing_references()."""

        loaded_count: int = 0
        for image_path in sorted(self.storage_dir.glob("*")):
            if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue

            reference_id: str = image_path.stem
            if reference_id in self._faces:
                continue

            try:
                encoding: np.ndarray = self._extract_face_encoding(image_path)
            except HTTPException:
                # Bỏ qua file không hợp lệ để tránh làm fail toàn bộ app khi khởi động.
                continue

            self._faces[reference_id] = ReferenceFace(
                reference_id=reference_id,
                label=f"person-{reference_id[:8]}",
                image_path=str(image_path),
                encoding=encoding,
            )
            loaded_count += 1

        return loaded_count

    async def add_reference(self, label: str, upload_file: UploadFile) -> ReferenceInfo:
        """Lưu ảnh tham chiếu mới và tạo embedding; ví dụ: await registry.add_reference('An', file)."""

        file_suffix: str = Path(upload_file.filename or "reference.jpg").suffix.lower() or ".jpg"
        if file_suffix not in {".jpg", ".jpeg", ".png"}:
            raise HTTPException(status_code=400, detail="Chỉ hỗ trợ ảnh JPG/JPEG/PNG")

        reference_id: str = str(uuid.uuid4())
        safe_label: str = label.strip() or f"person-{reference_id[:8]}"
        save_path: Path = self.storage_dir / f"{reference_id}{file_suffix}"
        raw_bytes: bytes = await upload_file.read()
        save_path.write_bytes(raw_bytes)

        encoding: np.ndarray = self._extract_face_encoding(save_path)
        self._faces[reference_id] = ReferenceFace(
            reference_id=reference_id,
            label=safe_label,
            image_path=str(save_path),
            encoding=encoding,
        )

        return ReferenceInfo(reference_id=reference_id, label=safe_label, image_path=str(save_path))

    def list_references(self) -> list[ReferenceInfo]:
        """Lấy danh sách khuôn mặt tham chiếu; ví dụ: registry.list_references()."""

        return [
            ReferenceInfo(reference_id=face.reference_id, label=face.label, image_path=face.image_path)
            for face in self._faces.values()
        ]

    def delete_reference(self, reference_id: str) -> None:
        """Xóa một khuôn mặt tham chiếu; ví dụ: registry.delete_reference('id')."""

        face: ReferenceFace | None = self._faces.pop(reference_id, None)
        if face is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy reference_id")

        image_path: Path = Path(face.image_path)
        if image_path.exists():
            image_path.unlink()

    def get_faces(self, reference_ids: list[str] | None = None) -> list[ReferenceFace]:
        """Lấy danh sách embedding theo reference_ids; ví dụ: registry.get_faces(['id1'])."""

        if not reference_ids:
            return list(self._faces.values())

        selected_faces: list[ReferenceFace] = []
        for reference_id in reference_ids:
            if reference_id not in self._faces:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy reference_id={reference_id}")
            selected_faces.append(self._faces[reference_id])
        return selected_faces

    def get_reference_image_path(self, reference_id: str) -> Path:
        """Lấy đường dẫn ảnh tham chiếu theo ID; ví dụ: registry.get_reference_image_path('id')."""

        face: ReferenceFace | None = self._faces.get(reference_id)
        if face is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy reference_id")
        return Path(face.image_path)

    def _extract_face_encoding(self, image_path: Path) -> np.ndarray:
        """Trích xuất embedding từ ảnh tham chiếu; ví dụ: self._extract_face_encoding(Path('a.jpg'))."""

        image_array: np.ndarray = face_recognition.load_image_file(str(image_path))
        face_locations: list[tuple[int, int, int, int]] = face_recognition.face_locations(image_array, model="hog")
        if len(face_locations) == 0:
            image_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Ảnh upload không có khuôn mặt")
        if len(face_locations) > 1:
            image_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Ảnh upload có nhiều hơn 1 khuôn mặt")

        encodings: list[np.ndarray] = face_recognition.face_encodings(image_array, known_face_locations=face_locations)
        if not encodings:
            image_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Không thể tạo embedding cho khuôn mặt")
        return encodings[0]
