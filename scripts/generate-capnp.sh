#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_DIR="${ROOT_DIR}/packages/capnp"
SCHEMA_FILE="${SCHEMA_DIR}/verify.capnp"

OUT_ROOT="${ROOT_DIR}/packages/capnp/generated"
TS_OUT_DIR="${OUT_ROOT}/ts"
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

CAPNP_ES_BIN=""
if command -v capnp-es >/dev/null 2>&1; then
  CAPNP_ES_BIN="capnp-es"
elif [[ -x "${ROOT_DIR}/node_modules/.bin/capnp-es" ]]; then
  CAPNP_ES_BIN="${ROOT_DIR}/node_modules/.bin/capnp-es"
else
  echo "capnp-es not found. Install capnp-es in the workspace." >&2
  exit 1
fi

rm -rf "${CPP_OUT_DIR}"
mkdir -p "${TS_OUT_DIR}"
mkdir -p "${CPP_OUT_DIR}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

cp "${SCHEMA_FILE}" "${TMP_DIR}/verify.capnp"

"${CAPNP_ES_BIN}" "${TMP_DIR}/verify.capnp" -ojs,ts,dts

mkdir -p "${TS_OUT_DIR}"
mv "${TMP_DIR}/verify.js" "${TS_OUT_DIR}/verify.js"
mv "${TMP_DIR}/verify.ts" "${TS_OUT_DIR}/verify.ts"
mv "${TMP_DIR}/verify.d.ts" "${TS_OUT_DIR}/verify.d.ts"

PATH="${CAPNP_PLUGIN_DIR}:${PATH}" "${CAPNP_BIN}" compile \
  --src-prefix "${SCHEMA_DIR}" \
  -o c++:"${CPP_OUT_DIR}" \
  "${SCHEMA_FILE}"

echo "Cap'n Proto code generated:"
echo "  TS: ${TS_OUT_DIR}"
echo "  C++: ${CPP_OUT_DIR}"
