#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_DIR="${ROOT_DIR}/packages/capnp"
SCHEMA_FILE="${SCHEMA_DIR}/verify.capnp"

OUT_ROOT="${ROOT_DIR}/packages/capnp/generated"
CPP_OUT_DIR="${OUT_ROOT}/c"

CAPNP_BIN=""
CAPNP_PLUGIN_DIR=""
CAPNPROTO_SWIFT_ROOT="${CAPNPROTO_SWIFT_PATH:-}"

if [[ -z "${CAPNPROTO_SWIFT_ROOT}" ]]; then
  CAPNPROTO_SWIFT_ROOT="${HOME}/Work/capnproto-swift"
fi

CAPNP_SWIFT_BIN="${CAPNPROTO_SWIFT_ROOT}/.build/xcframework/macosx/capnproto/c++/src/capnp/capnp"
if [[ -x "${CAPNP_SWIFT_BIN}" ]]; then
  CAPNP_BIN="${CAPNP_SWIFT_BIN}"
  CAPNP_PLUGIN_DIR="$(dirname "${CAPNP_SWIFT_BIN}")"
else
  echo "capnp compiler from capnproto-swift not found at ${CAPNP_SWIFT_BIN}." >&2
  echo "Build capnproto-swift first and set CAPNPROTO_SWIFT_PATH if it is not at ${CAPNPROTO_SWIFT_ROOT}." >&2
  exit 1
fi

if [[ "${CAPNP_GENERATE_TS:-true}" == "true" ]]; then
  bash "${ROOT_DIR}/scripts/generate-capnp-ts.sh"
fi

rm -rf "${CPP_OUT_DIR}"
mkdir -p "${CPP_OUT_DIR}"

PATH="${CAPNP_PLUGIN_DIR}:${PATH}" "${CAPNP_BIN}" compile \
  --src-prefix "${SCHEMA_DIR}" \
  -o c++:"${CPP_OUT_DIR}" \
  "${SCHEMA_FILE}"

echo "Cap'n Proto C++ code generated:"
echo "  C++: ${CPP_OUT_DIR}"
