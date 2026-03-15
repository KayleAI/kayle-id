import base64
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

import cv2
import numpy as np


MODEL_INPUT_SIZE = (112, 112)
DETAIL_STDDEV_MIN = 12.0
FACE_MARGIN_RATIO = 0.2
DEFAULT_THRESHOLD = 0.8
MODEL_PATH = os.environ.get("FACE_MATCHER_MODEL_PATH", "/app/models/w600k_mbf.onnx")
PORT = int(os.environ.get("PORT", "8080"))


def emit_log(event: str, **details: object) -> None:
    print(json.dumps({"event": f"face_matcher.{event}", **details}), flush=True)


def clamp_score(value: float) -> float:
    return max(0.0, min(1.0, value))


def normalize_cosine_score(raw_score: float) -> float:
    return clamp_score((raw_score + 1.0) / 2.0)


def decode_selfie(selfie_base64: str) -> Optional[np.ndarray]:
    try:
        encoded = base64.b64decode(selfie_base64)
        buffer = np.frombuffer(encoded, dtype=np.uint8)
        return cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    except Exception:
        return None


def decode_dg2_rgba(image_payload: dict) -> np.ndarray:
    rgba = base64.b64decode(image_payload["rgbaBase64"])
    width = int(image_payload["width"])
    height = int(image_payload["height"])
    rgba_image = np.frombuffer(rgba, dtype=np.uint8).reshape((height, width, 4))
    return cv2.cvtColor(rgba_image, cv2.COLOR_RGBA2BGR)


def prepare_center_crop(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    size = min(height, width)
    offset_x = max((width - size) // 2, 0)
    offset_y = max((height - size) // 2, 0)
    cropped = image[offset_y:offset_y + size, offset_x:offset_x + size]
    return cv2.resize(cropped, MODEL_INPUT_SIZE)


def detect_face_bbox(cascade: cv2.CascadeClassifier, image: np.ndarray):
    grayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(
        grayscale,
        scaleFactor=1.1,
        minNeighbors=4,
        minSize=(20, 20),
    )

    if len(faces) == 0:
        return None

    return max(faces, key=lambda face: int(face[2]) * int(face[3]))


def prepare_face_crop(
    cascade: cv2.CascadeClassifier, image: np.ndarray
) -> Optional[np.ndarray]:
    face = detect_face_bbox(cascade, image)

    if face is None:
        prepared = prepare_center_crop(image)
    else:
        x, y, width, height = face
        center_x = x + width / 2
        center_y = y + height / 2
        size = max(width, height) * (1.0 + FACE_MARGIN_RATIO)
        half_size = size / 2
        left = max(int(center_x - half_size), 0)
        top = max(int(center_y - half_size), 0)
        right = min(int(center_x + half_size), image.shape[1])
        bottom = min(int(center_y + half_size), image.shape[0])
        cropped = image[top:bottom, left:right]
        prepared = cv2.resize(cropped, MODEL_INPUT_SIZE)

    grayscale = cv2.cvtColor(prepared, cv2.COLOR_BGR2GRAY)

    if float(grayscale.std()) < DETAIL_STDDEV_MIN:
        return None

    return prepared


def build_embedding(
    cascade: cv2.CascadeClassifier,
    recognizer: cv2.FaceRecognizerSF,
    image: np.ndarray,
):
    prepared = prepare_face_crop(cascade, image)

    if prepared is None:
        return None

    return recognizer.feature(prepared)


def compare_faces(
    cascade: cv2.CascadeClassifier,
    recognizer: cv2.FaceRecognizerSF,
    dg2_image: np.ndarray,
    selfies_base64: list[str],
    threshold: float,
) -> dict:
    dg2_embedding = build_embedding(cascade, recognizer, dg2_image)

    if dg2_embedding is None:
        return {
            "faceScore": None,
            "passed": False,
            "reason": "face_score_dg2_detail_insufficient",
            "usedFallback": True,
        }

    best_score = None

    for selfie_base64 in selfies_base64:
        selfie = decode_selfie(selfie_base64)

        if selfie is None:
            continue

        selfie_embedding = build_embedding(cascade, recognizer, selfie)

        if selfie_embedding is None:
            continue

        raw_score = float(
            recognizer.match(
                dg2_embedding,
                selfie_embedding,
                cv2.FaceRecognizerSF_FR_COSINE,
            )
        )
        normalized_score = normalize_cosine_score(raw_score)

        if best_score is None or normalized_score > best_score:
            best_score = normalized_score

    if best_score is None:
        return {
            "faceScore": None,
            "passed": False,
            "reason": "face_score_no_decodable_selfies",
            "usedFallback": True,
        }

    return {
        "faceScore": best_score,
        "passed": best_score >= threshold,
        "usedFallback": False,
    }


class MatcherRuntime:
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.error: Optional[str] = None
        self.cascade: Optional[cv2.CascadeClassifier] = None
        self.recognizer: Optional[cv2.FaceRecognizerSF] = None
        self._load()

    def _load(self) -> None:
        try:
            self.cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            self.recognizer = cv2.FaceRecognizerSF.create(self.model_path, "")
            emit_log("container_ready", model_path=self.model_path)
        except Exception as error:
            self.error = str(error)
            emit_log("container_failed", model_path=self.model_path, error=self.error)

    @property
    def ready(self) -> bool:
        return self.error is None and self.cascade is not None and self.recognizer is not None

    def health_payload(self) -> dict:
        return {
            "data": {
                "modelPath": self.model_path,
                "ready": self.ready,
                "status": "healthy" if self.ready else "unhealthy",
            },
            "error": None if self.ready else {"code": "MATCHER_UNAVAILABLE", "message": self.error or "Matcher runtime is unavailable."},
        }

    def match(self, payload: dict) -> dict:
        if not self.ready or self.cascade is None or self.recognizer is None:
            return {
                "faceScore": None,
                "passed": False,
                "reason": "face_matcher_unavailable:runtime_not_ready",
                "usedFallback": True,
            }

        dg2_image = decode_dg2_rgba(payload["dg2Image"])
        threshold = float(payload.get("threshold") or DEFAULT_THRESHOLD)
        return compare_faces(
            self.cascade,
            self.recognizer,
            dg2_image,
            payload["selfiesBase64"],
            threshold,
        )


RUNTIME = MatcherRuntime(MODEL_PATH)


class MatcherHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        return

    def respond(self, status: int, payload: dict) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        if self.path != "/health":
            self.respond(
                HTTPStatus.NOT_FOUND,
                {"error": {"code": "NOT_FOUND", "message": "Route not found."}},
            )
            return

        payload = RUNTIME.health_payload()
        status = HTTPStatus.OK if payload["data"]["ready"] else HTTPStatus.SERVICE_UNAVAILABLE
        self.respond(status, payload)

    def do_POST(self) -> None:
        if self.path != "/match":
            self.respond(
                HTTPStatus.NOT_FOUND,
                {"error": {"code": "NOT_FOUND", "message": "Route not found."}},
            )
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            self.respond(
                HTTPStatus.BAD_REQUEST,
                {
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Matcher payload must be valid JSON.",
                    }
                },
            )
            return

        try:
            result = RUNTIME.match(payload)
            emit_log(
                "container_completed",
                dg2_width=payload.get("dg2Image", {}).get("width"),
                dg2_height=payload.get("dg2Image", {}).get("height"),
                selfie_count=len(payload.get("selfiesBase64", [])),
                face_score=result.get("faceScore"),
                passed=result.get("passed"),
                reason=result.get("reason"),
                used_fallback=result.get("usedFallback"),
            )
            self.respond(HTTPStatus.OK, result)
        except Exception as error:
            emit_log("container_match_failed", error=str(error))
            self.respond(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "faceScore": None,
                    "passed": False,
                    "reason": "face_matcher_unavailable:container_runtime_failed",
                    "usedFallback": True,
                },
            )


def main() -> int:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), MatcherHandler)
    emit_log("container_listening", model_path=MODEL_PATH, port=PORT)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
