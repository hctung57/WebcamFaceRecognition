# Face Recognition Tracking Server (Browser Webcam Only)

Ung dung nay chi nhan webcam tu MAY NGUOI DUNG qua trinh duyet.

## 1) Tinh nang

1. Upload anh khuon mat tham chieu tu giao dien web.
2. Mo webcam tren thiet bi nguoi dung (getUserMedia).
3. Gui frame webcam len server de nhan dien theo thoi gian thuc.
4. Ve bounding box + nhan (label) ngay tren browser.

## 2) Kien truc

- Backend: `FastAPI` + `face_recognition` + `opencv-python-headless`.
- Frontend: `HTML/CSS/JS` phuc vu boi FastAPI.
- Webcam: chi mo o phia browser client.
- Khong con ho tro stream server webcam `0,1,...`.

## 3) Chay bang Docker

### Build image

```bash
docker build -t face-recognition-tracking:latest .
```

### Run HTTP

```bash
docker run --rm -it \
  --name face-recognition-tracking \
  -p 8000:8000 \
  -v "$(pwd)/data:/app/data" \
  face-recognition-tracking:latest
```

Mo: `http://localhost:8000`

### Run HTTPS (khuyen nghi khi truy cap tu may khac)

```bash
docker run --rm -it \
  --name face-recognition-tracking \
  -p 8443:8000 \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/certs:/app/certs:ro" \
  -e SSL_CERT_FILE=/app/certs/cert.pem \
  -e SSL_KEY_FILE=/app/certs/key.pem \
  face-recognition-tracking:latest
```

Mo: `https://<ip-server>:8443`

## 4) Chay local (khong Docker)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
./start.sh
```

## 5) Huong dan su dung

1. Mo trang web.
2. Upload khuon mat tham chieu (jpg/jpeg/png, nen chi co 1 khuon mat/anh).
3. Tick reference can doi chieu.
4. Bam `Bat webcam client` va cap quyen camera cho browser.
5. Xem ket qua nhan dien truc tiep tren man hinh webcam.

## 6) API

### `POST /api/references`

- Form-data:
- `label` (optional)
- `image` (required)

### `GET /api/references`

- Tra ve danh sach reference da luu.

### `DELETE /api/references/{reference_id}`

- Xoa reference theo ID.

### `POST /api/browser-recognition`

Body JSON:

```json
{
  "image_base64": "data:image/jpeg;base64,...",
  "reference_ids": ["ref-1", "ref-2"]
}
```

## 7) Luu y webcam browser

- Nhieu browser chan webcam qua HTTP khi truy cap bang IP LAN.
- Neu bi chan camera, dung HTTPS hoac mo bang `localhost` tren chinh may do.

## 8) Troubleshooting

### Upload anh bi tu choi

- Anh khong co khuon mat.
- Anh co nhieu hon 1 khuon mat.
- Dinh dang khong phai jpg/jpeg/png.

### Browser khong mo duoc webcam

- Chua cap quyen camera trong browser.
- Dang truy cap HTTP qua IP va browser block insecure context.

### Nhan dien cham

- Giam do phan giai webcam trong browser.
- Dung may chu manh hon (CPU tot hon).
