#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="${SCRIPT_DIR}/../models"

RECOGNIZER_MODEL_URL="https://github.com/yakhyo/face-reidentification/releases/download/v0.0.1/w600k_mbf.onnx"

mkdir -p "${MODELS_DIR}"

if [ ! -f "${MODELS_DIR}/w600k_mbf.onnx" ]; then
  curl -L "${RECOGNIZER_MODEL_URL}" -o "${MODELS_DIR}/w600k_mbf.onnx"
fi

echo "Face matcher models are ready in ${MODELS_DIR}"
