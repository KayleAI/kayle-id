#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_DIR="${ROOT_DIR}/packages/capnp"
SCHEMA_FILE="${SCHEMA_DIR}/verify.capnp"

OUT_ROOT="${ROOT_DIR}/packages/capnp/generated"
CPP_OUT_DIR="${OUT_ROOT}/c"

CAPNP_BIN=""
CAPNP_PLUGIN_DIR=""
CAPNP_SWIFT_BIN="/Users/arsen/Work/capnproto-swift/.build/xcframework/macosx/capnproto/c++/src/capnp/capnp"
if [[ -x "${CAPNP_SWIFT_BIN}" ]]; then
  CAPNP_BIN="${CAPNP_SWIFT_BIN}"
  CAPNP_PLUGIN_DIR="$(dirname "${CAPNP_SWIFT_BIN}")"
else
  echo "capnp compiler from capnproto-swift not found at ${CAPNP_SWIFT_BIN}." >&2
  echo "Build capnproto-swift first so the compiler matches the headers." >&2
  exit 1
fi

bash "${ROOT_DIR}/scripts/generate-capnp-ts.sh"

rm -rf "${CPP_OUT_DIR}"
mkdir -p "${CPP_OUT_DIR}"

PATH="${CAPNP_PLUGIN_DIR}:${PATH}" "${CAPNP_BIN}" compile \
  --src-prefix "${SCHEMA_DIR}" \
  -o c++:"${CPP_OUT_DIR}" \
  "${SCHEMA_FILE}"

echo "Cap'n Proto C++ code generated:"
echo "  C++: ${CPP_OUT_DIR}"
