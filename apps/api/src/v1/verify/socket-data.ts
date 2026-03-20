import type { VerifyDataPayload } from "./data-payload";
import {
  isNfcDataKind,
  isSelfieDataKind,
  processDataPayload,
} from "./data-payload";
import { resolveVerifyErrorMessage } from "./error-response";
import type { VerifySocketContext } from "./socket-context";

export function handleDataMessage(
  context: VerifySocketContext,
  payload: VerifyDataPayload
): void {
  const { state, transport } = context;
  const kind = payload.kind ?? 0;

  transport.logDebug("recv_data", {
    kind,
    size: payload.raw?.length ?? 0,
    index: payload.index ?? 0,
    total: payload.total ?? 0,
    chunkIndex: payload.chunkIndex ?? 0,
    chunkTotal: payload.chunkTotal ?? 0,
  });

  if (isNfcDataKind(kind) && state.currentPhase !== "nfc_reading") {
    transport.sendError(
      "NFC_DATA_PHASE_REQUIRED",
      resolveVerifyErrorMessage("NFC_DATA_PHASE_REQUIRED")
    );
    return;
  }

  if (isSelfieDataKind(kind) && state.currentPhase !== "selfie_capturing") {
    transport.sendError(
      "SELFIE_DATA_PHASE_REQUIRED",
      resolveVerifyErrorMessage("SELFIE_DATA_PHASE_REQUIRED")
    );
    return;
  }

  const result = processDataPayload({
    state: state.transfer,
    payload: {
      ...payload,
      kind,
    },
  });

  if (result.error) {
    transport.sendError(result.error.code, result.error.message);
    return;
  }

  for (const ack of result.acks) {
    transport.sendAck(ack);
  }
}
