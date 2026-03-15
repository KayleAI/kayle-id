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

ENV FACE_MATCHER_MODEL_PATH=/app/models/w600k_mbf.onnx \
    PATH="/app/.venv/bin:${PATH}" \
    PORT=8080

EXPOSE 8080

CMD ["uv", "run", "--no-sync", "python", "src/service.py"]
