FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project

COPY scripts/download-models.sh ./scripts/download-models.sh
RUN chmod +x ./scripts/download-models.sh && ./scripts/download-models.sh

COPY src/service.py ./src/service.py

RUN uv run --no-sync python -c "import cv2; detector = cv2.FaceDetectorYN.create('/app/models/face_detection_yunet_2023mar.onnx', '', (320, 320), 0.85, 0.3, 5000); recognizer = cv2.FaceRecognizerSF.create('/app/models/w600k_mbf.onnx', ''); assert detector is not None; assert recognizer is not None"

ENV FACE_MATCHER_DETECTOR_PATH=/app/models/face_detection_yunet_2023mar.onnx \
    FACE_MATCHER_MODEL_PATH=/app/models/w600k_mbf.onnx \
    PATH="/app/.venv/bin:${PATH}" \
    PORT=8080

EXPOSE 8080

CMD ["uv", "run", "--no-sync", "python", "src/service.py"]
