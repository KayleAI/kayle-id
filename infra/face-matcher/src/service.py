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
SMALL_IMAGE_FALLBACK_MAX_DIMENSION = 64
STRICT_IMAGE_SIMILARITY_THRESHOLD = 0.995
DEFAULT_THRESHOLD = 0.8
DEFAULT_DETECTOR_INPUT_SIZE = (320, 320)
MODEL_PATH = os.environ.get("FACE_MATCHER_MODEL_PATH", "/app/models/w600k_mbf.onnx")
DETECTOR_MODEL_PATH = os.environ.get(
    "FACE_MATCHER_DETECTOR_PATH", "/app/models/face_detection_yunet_2023mar.onnx"
)
PORT = int(os.environ.get("PORT", "8080"))


def emit_log(event: str, **details: object) -> None:
    print(json.dumps({"event": f"face_matcher.{event}", **details}), flush=True)


def clamp_score(value: float) -> float:
    return max(0.0, min(1.0, value))


def normalize_cosine_score(raw_score: float) -> float:
    return clamp_score((raw_score + 1.0) / 2.0)


def normalize_correlation_score(raw_score: float) -> float:
    return clamp_score(raw_score)


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


def detect_face(
    detector: cv2.FaceDetectorYN, image: np.ndarray
) -> Optional[np.ndarray]:
    height, width = image.shape[:2]

    if height == 0 or width == 0:
        return None

    detector.setInputSize((width, height))
    _, faces = detector.detect(image)

    if faces is None or len(faces) == 0:
        return None

    best_face = max(
        faces,
        key=lambda face: float(face[2]) * float(face[3]) * max(float(face[14]), 0.0),
    )
    return best_face


def prepare_face_crop(
    detector: cv2.FaceDetectorYN,
    recognizer: cv2.FaceRecognizerSF,
    image: np.ndarray,
) -> Optional[np.ndarray]:
    face = detect_face(detector, image)

    if face is None:
        return None

    try:
        prepared = recognizer.alignCrop(image, face)
    except Exception:
        return None

    if prepared is None:
        return None

    prepared = cv2.resize(prepared, MODEL_INPUT_SIZE)

    grayscale = cv2.cvtColor(prepared, cv2.COLOR_BGR2GRAY)

    if float(grayscale.std()) < DETAIL_STDDEV_MIN:
        return None

    return prepared


def prepare_full_image_crop(image: np.ndarray) -> Optional[np.ndarray]:
    if image.size == 0:
        return None

    prepared = cv2.resize(image, MODEL_INPUT_SIZE)
    grayscale = cv2.cvtColor(prepared, cv2.COLOR_BGR2GRAY)

    if float(grayscale.std()) < DETAIL_STDDEV_MIN:
        return None

    return prepared


def build_embedding(
    detector: cv2.FaceDetectorYN,
    recognizer: cv2.FaceRecognizerSF,
    image: np.ndarray,
    allow_full_image_fallback: bool = False,
):
    prepared = prepare_face_crop(detector, recognizer, image)

    if prepared is None and allow_full_image_fallback:
        prepared = prepare_full_image_crop(image)

    if prepared is None:
        return None

    return recognizer.feature(prepared)


def should_allow_small_image_fallback(image: np.ndarray) -> bool:
    height, width = image.shape[:2]
    return min(height, width) <= SMALL_IMAGE_FALLBACK_MAX_DIMENSION


def compute_image_similarity(
    dg2_image: np.ndarray, selfie_image: np.ndarray
) -> Optional[float]:
    dg2_grayscale = cv2.cvtColor(
        cv2.resize(dg2_image, MODEL_INPUT_SIZE), cv2.COLOR_BGR2GRAY
    ).astype(np.float32)
    selfie_grayscale = cv2.cvtColor(
        cv2.resize(selfie_image, MODEL_INPUT_SIZE), cv2.COLOR_BGR2GRAY
    ).astype(np.float32)

    dg2_centered = dg2_grayscale - float(dg2_grayscale.mean())
    selfie_centered = selfie_grayscale - float(selfie_grayscale.mean())
    dg2_norm = float(np.linalg.norm(dg2_centered))
    selfie_norm = float(np.linalg.norm(selfie_centered))

    if dg2_norm == 0.0 or selfie_norm == 0.0:
        return None

    raw_score = float(
        np.dot(dg2_centered.flatten(), selfie_centered.flatten())
        / (dg2_norm * selfie_norm)
    )
    return normalize_correlation_score(raw_score)


def compare_faces(
    detector: cv2.FaceDetectorYN,
    recognizer: cv2.FaceRecognizerSF,
    dg2_image: np.ndarray,
    selfies_base64: list[str],
    threshold: float,
) -> dict:
    dg2_embedding = build_embedding(
        detector,
        recognizer,
        dg2_image,
        allow_full_image_fallback=True,
    )

    best_score = None
    selfie_diagnostics: list[dict[str, object]] = []

    for index, selfie_base64 in enumerate(selfies_base64):
        selfie = decode_selfie(selfie_base64)
        diagnostic = {
            "decoded": selfie is not None,
            "index": index,
            "similarity": None,
            "used_embedding": False,
        }

        if selfie is None:
            selfie_diagnostics.append(diagnostic)
            continue

        selfie_embedding = build_embedding(
            detector,
            recognizer,
            selfie,
            allow_full_image_fallback=should_allow_small_image_fallback(selfie),
        )

        normalized_score = None

        if selfie_embedding is not None and dg2_embedding is not None:
            raw_score = float(
                recognizer.match(
                    dg2_embedding,
                    selfie_embedding,
                    cv2.FaceRecognizerSF_FR_COSINE,
                )
            )
            normalized_score = normalize_cosine_score(raw_score)
            diagnostic["used_embedding"] = True
        else:
            normalized_score = compute_image_similarity(dg2_image, selfie)

            if (
                normalized_score is not None
                and normalized_score < STRICT_IMAGE_SIMILARITY_THRESHOLD
            ):
                normalized_score = None

        diagnostic["similarity"] = normalized_score
        selfie_diagnostics.append(diagnostic)

        if normalized_score is None:
            continue

        if best_score is None or normalized_score > best_score:
            best_score = normalized_score

    if best_score is None:
        emit_log(
            "comparison_failed",
            dg2_embedding_present=dg2_embedding is not None,
            selfie_diagnostics=selfie_diagnostics,
        )

        if dg2_embedding is None:
            return {
                "faceScore": None,
                "passed": False,
                "reason": "face_score_dg2_face_not_detected",
                "usedFallback": True,
            }

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
    def __init__(self, detector_model_path: str, model_path: str):
        self.detector_model_path = detector_model_path
        self.model_path = model_path
        self.error: Optional[str] = None
        self.detector: Optional[cv2.FaceDetectorYN] = None
        self.recognizer: Optional[cv2.FaceRecognizerSF] = None
        self._load()

    def _load(self) -> None:
        try:
            self.detector = cv2.FaceDetectorYN.create(
                self.detector_model_path,
                "",
                DEFAULT_DETECTOR_INPUT_SIZE,
                0.85,
                0.3,
                5000,
            )
            self.recognizer = cv2.FaceRecognizerSF.create(self.model_path, "")
            emit_log(
                "container_ready",
                detector_model_path=self.detector_model_path,
                model_path=self.model_path,
            )
        except Exception as error:
            self.error = str(error)
            emit_log(
                "container_failed",
                detector_model_path=self.detector_model_path,
                model_path=self.model_path,
                error=self.error,
            )

    @property
    def ready(self) -> bool:
        return (
            self.error is None
            and self.detector is not None
            and self.recognizer is not None
        )

    def health_payload(self) -> dict:
        return {
            "data": {
                "detectorModelPath": self.detector_model_path,
                "modelPath": self.model_path,
                "ready": self.ready,
                "status": "healthy" if self.ready else "unhealthy",
            },
            "error": None if self.ready else {"code": "MATCHER_UNAVAILABLE", "message": self.error or "Matcher runtime is unavailable."},
        }

    def match(self, payload: dict) -> dict:
        if not self.ready or self.detector is None or self.recognizer is None:
            reason_suffix = self.error or "unknown"
            return {
                "faceScore": None,
                "passed": False,
                "reason": f"face_matcher_unavailable:runtime_not_ready:{reason_suffix}",
                "usedFallback": True,
            }

        dg2_image = decode_dg2_rgba(payload["dg2Image"])
        threshold = float(payload.get("threshold") or DEFAULT_THRESHOLD)
        return compare_faces(
            self.detector,
            self.recognizer,
            dg2_image,
            payload["selfiesBase64"],
            threshold,
        )


RUNTIME = MatcherRuntime(DETECTOR_MODEL_PATH, MODEL_PATH)


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
    emit_log(
        "container_listening",
        detector_model_path=DETECTOR_MODEL_PATH,
        model_path=MODEL_PATH,
        port=PORT,
    )
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
