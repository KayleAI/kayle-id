import {
  claimAttemptConnection,
  releaseAttemptConnection,
} from "./attempt-connection";
import {
  consumeHelloAttempt,
  getAttemptForHello,
  type HelloPayload,
  isAttemptMissingOrTerminal,
  markSessionInProgress,
  parseHelloPayload,
  resolveHelloAuthState,
} from "./hello-auth";
import { persistTrackedAttemptPhase } from "./phase-state";
import type { VerifySocketContext } from "./socket-context";

function resetAttemptState(
  context: VerifySocketContext,
  attemptId: string
): void {
  const { connectionOwnerId, state } = context;

  releaseAttemptConnection({
    attemptId,
    ownerId: connectionOwnerId,
  });
  state.acceptedFaceScore = null;
  state.attemptId = null;
  state.currentPhase = null;
  state.shareManifest = null;
  state.shareRequestSent = false;
}

async function persistConnectedPhaseIfMissing(
  context: VerifySocketContext,
  attemptId: string
): Promise<void> {
  if (context.state.currentPhase) {
    return;
  }

  await persistTrackedAttemptPhase({
    attemptId,
    phase: "mobile_connected",
  });
  context.state.currentPhase = "mobile_connected";
}

export async function handleHelloMessage(
  context: VerifySocketContext,
  payload: HelloPayload
): Promise<void> {
  const { connectionOwnerId, log, session, state, transport } = context;
  const parsed = parseHelloPayload(payload);

  transport.logDebug("recv_hello", {
    attemptIdPresent: Boolean(parsed?.attemptId),
    mobileWriteTokenPresent: Boolean(parsed?.mobileWriteToken),
    deviceIdPresent: Boolean(parsed?.deviceId),
  });

  if (!parsed) {
    transport.sendAuthErrorAndClose("HELLO_AUTH_REQUIRED");
    return;
  }

  const attempt = await getAttemptForHello(session.id, parsed.attemptId);
  if (isAttemptMissingOrTerminal(attempt)) {
    transport.sendAuthErrorAndClose("ATTEMPT_NOT_FOUND");
    return;
  }

  if (
    state.helloReceived &&
    state.attemptId &&
    state.attemptId !== attempt.id
  ) {
    transport.sendAuthErrorAndClose("HELLO_AUTH_REQUIRED");
    return;
  }

  const authState = await resolveHelloAuthState({
    attempt,
    mobileWriteToken: parsed.mobileWriteToken,
    deviceId: parsed.deviceId,
    nowMs: Date.now(),
  });

  if (authState.kind === "error") {
    transport.sendAuthErrorAndClose(authState.code);
    return;
  }

  const ownership = claimAttemptConnection({
    attemptId: attempt.id,
    ownerId: connectionOwnerId,
  });

  if (!ownership.ok) {
    transport.sendAuthErrorAndClose(ownership.code);
    return;
  }

  state.acceptedFaceScore = null;
  state.attemptId = attempt.id;
  state.currentPhase = attempt.currentPhase ?? null;
  state.helloReceived = true;
  state.shareManifest = null;
  state.shareRequestSent = false;
  log.set({
    attempt_id: attempt.id,
  });

  if (authState.kind === "resume") {
    await persistConnectedPhaseIfMissing(context, attempt.id);
    transport.sendAck("hello_ok");
    return;
  }

  try {
    await consumeHelloAttempt({
      attemptId: attempt.id,
      deviceIdHash: authState.deviceIdHash,
      appVersion: parsed.appVersion,
    });
    await markSessionInProgress(session);
    await persistTrackedAttemptPhase({
      attemptId: attempt.id,
      phase: "mobile_connected",
    });
    state.currentPhase = "mobile_connected";
  } catch (error) {
    resetAttemptState(context, attempt.id);
    throw error;
  }

  transport.sendAck("hello_ok");
}
