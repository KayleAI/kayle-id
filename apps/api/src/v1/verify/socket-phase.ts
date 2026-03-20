import { resolveVerifyErrorMessage } from "./error-response";
import {
  isTrackedAttemptPhase,
  persistTrackedAttemptPhase,
  validateTrackedPhaseTransition,
} from "./phase-state";
import type { VerifySocketContext } from "./socket-context";
import {
  buildMissingDataMessage,
  runPhaseValidation,
} from "./socket-phase-validation";

type PhasePayload = {
  error?: string;
  phase?: string;
};

export async function handlePhaseMessage(
  context: VerifySocketContext,
  payload: PhasePayload
): Promise<void> {
  const { state, transport } = context;

  transport.logDebug("recv_phase", {
    phase: payload.phase ?? "",
    error: payload.error ?? "",
  });

  if (!state.attemptId) {
    transport.sendError("HELLO_REQUIRED", "Send hello before other messages.");
    return;
  }

  const nextPhase = payload.phase?.trim() ?? "";
  if (!isTrackedAttemptPhase(nextPhase)) {
    transport.sendAck("phase_ok");
    return;
  }

  const missingData = buildMissingDataMessage(context, nextPhase);
  if (missingData) {
    transport.sendError(missingData.code, missingData.message);
    return;
  }

  const transition = validateTrackedPhaseTransition({
    currentPhase: state.currentPhase,
    nextPhase,
  });
  if (!transition.ok) {
    transport.sendError(
      transition.code,
      resolveVerifyErrorMessage(transition.code)
    );
    return;
  }

  const verdict =
    nextPhase === "nfc_complete" || nextPhase === "selfie_complete"
      ? await runPhaseValidation(context, state.attemptId, nextPhase)
      : null;

  if (
    verdict?.outcome === "rejected" ||
    (nextPhase === "nfc_complete" && verdict)
  ) {
    return;
  }

  if (transition.changed) {
    await persistTrackedAttemptPhase({
      attemptId: state.attemptId,
      phase: transition.nextPhase,
    });
    state.currentPhase = transition.nextPhase;
  }

  if (nextPhase === "selfie_complete" && verdict) {
    transport.sendVerdict(verdict);
    transport.sendShareRequest(context.shareRequestPayload);
    state.shareRequestSent = true;
    return;
  }

  transport.sendAck("phase_ok");
}
