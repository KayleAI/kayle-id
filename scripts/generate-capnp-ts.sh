#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_DIR="${ROOT_DIR}/packages/capnp"
SCHEMA_FILE="${SCHEMA_DIR}/verify.capnp"
TS_OUT_DIR="${SCHEMA_DIR}/generated/ts"

CAPNP_ES_BIN=""
if command -v capnp-es >/dev/null 2>&1; then
  CAPNP_ES_BIN="capnp-es"
elif [[ -x "${ROOT_DIR}/node_modules/.bin/capnp-es" ]]; then
  CAPNP_ES_BIN="${ROOT_DIR}/node_modules/.bin/capnp-es"
else
  echo "capnp-es not found. Install capnp-es in the workspace." >&2
  exit 1
fi

mkdir -p "${TS_OUT_DIR}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

cp "${SCHEMA_FILE}" "${TMP_DIR}/verify.capnp"
"${CAPNP_ES_BIN}" "${TMP_DIR}/verify.capnp" -ojs,ts,dts

mv "${TMP_DIR}/verify.js" "${TS_OUT_DIR}/verify.js"
mv "${TMP_DIR}/verify.ts" "${TS_OUT_DIR}/verify.ts"
mv "${TMP_DIR}/verify.d.ts" "${TS_OUT_DIR}/verify.d.ts"

echo "Cap'n Proto TypeScript code generated:"
echo "  TS: ${TS_OUT_DIR}"
