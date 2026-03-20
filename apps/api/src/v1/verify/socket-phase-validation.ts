import { getNfcTransferStatus, getSelfieTransferStatus } from "./data-payload";
import { resolveVerifyErrorMessage } from "./error-response";
import { matchFaces } from "./face-matcher-client";
import {
  emitFaceScoreUnavailableEvent,
  MAX_FAILED_ATTEMPTS,
  markAttemptFailed,
} from "./outcome";
import type { VerifySocketContext } from "./socket-context";
import { validateAuthenticity } from "./validation";
import type { FaceScoreResult } from "./validation-types";

export function buildMissingDataMessage(
  context: VerifySocketContext,
  nextPhase: string
): {
  code: "NFC_REQUIRED_DATA_MISSING" | "SELFIE_REQUIRED_DATA_MISSING";
  message: string;
} | null {
  if (nextPhase === "nfc_complete") {
    const status = getNfcTransferStatus(context.state.transfer);

    return status.complete
      ? null
      : {
          code: "NFC_REQUIRED_DATA_MISSING",
          message: JSON.stringify({
            missing_artifacts: status.missingArtifacts,
            missing_chunks: status.missingChunks.map((chunk) => ({
              kind: chunk.kind,
              index: chunk.index,
              chunk_total: chunk.chunkTotal,
              missing_chunk_indices: chunk.missingChunkIndices,
            })),
          }),
        };
  }

  if (nextPhase !== "selfie_complete") {
    return null;
  }

  const status = getSelfieTransferStatus(context.state.transfer);

  return status.complete
    ? null
    : {
        code: "SELFIE_REQUIRED_DATA_MISSING",
        message: JSON.stringify({
          required_total: status.requiredTotal,
          missing_selfie_indexes: status.missingSelfieIndexes,
          missing_chunks: status.missingChunks.map((chunk) => ({
            kind: chunk.kind,
            index: chunk.index,
            chunk_total: chunk.chunkTotal,
            missing_chunk_indices: chunk.missingChunkIndices,
          })),
        }),
      };
}

async function rejectAttemptWithVerdict({
  attemptId,
  code,
  context,
  riskScore,
}: {
  attemptId: string;
  code: "passport_authenticity_failed" | "selfie_face_mismatch";
  context: VerifySocketContext;
  riskScore: number;
}) {
  const result = await markAttemptFailed({
    session: context.session,
    attemptId,
    failureCode: code,
    riskScore,
  });

  return {
    outcome: "rejected" as const,
    reasonCode: code,
    reasonMessage: resolveVerifyErrorMessage(code),
    retryAllowed: !result.terminalized,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - result.failedAttempts),
  };
}

async function resolveSelfieVerdict(
  context: VerifySocketContext,
  attemptId: string,
  faceResult: FaceScoreResult
) {
  if (!faceResult.passed) {
    const verdict = await rejectAttemptWithVerdict({
      attemptId,
      code: "selfie_face_mismatch",
      context,
      riskScore: faceResult.usedFallback ? 1 : 1 - (faceResult.faceScore ?? 0),
    });
    context.log.set({
      event: "verify.ws.rejected",
      failure_code: verdict.reasonCode,
      remaining_attempts: verdict.remainingAttempts,
      retry_allowed: verdict.retryAllowed,
    });
    context.transport.sendVerdict(verdict);
    context.transport.closeAfterVerdict(verdict.reasonCode);
    return verdict;
  }

  if (typeof faceResult.faceScore !== "number") {
    throw new Error("face_score_required_for_success");
  }

  context.state.acceptedFaceScore = faceResult.faceScore;
  return {
    outcome: "accepted" as const,
    reasonCode: "",
    reasonMessage: "",
    retryAllowed: false,
    remainingAttempts: 0,
  };
}

export async function runPhaseValidation(
  context: VerifySocketContext,
  attemptId: string,
  nextPhase: "nfc_complete" | "selfie_complete"
) {
  if (nextPhase === "nfc_complete") {
    const { dg1, dg2, sod } = context.state.transfer;

    if (!(dg1 && dg2 && sod)) {
      return null;
    }

    const authenticity = await validateAuthenticity({ dg1, dg2, sod });
    if (authenticity.ok) {
      return null;
    }

    const verdict = await rejectAttemptWithVerdict({
      attemptId,
      code: "passport_authenticity_failed",
      context,
      riskScore: 1,
    });
    context.transport.sendVerdict(verdict);
    context.transport.closeAfterVerdict(verdict.reasonCode);
    return verdict;
  }

  const documentPortrait = context.state.transfer.dg2;
  if (!documentPortrait) {
    return null;
  }

  const result = await matchFaces({
    dg2Image: documentPortrait,
    selfies: Array.from(context.state.transfer.selfies.values()),
    env: context.env,
    attemptId,
    logger: context.log,
  });
  context.log.info("verify.ws.face_score_evaluated", {
    attempt_id: attemptId,
    face_score: result.faceScore,
    passed: result.passed,
    reason: result.reason ?? null,
    used_fallback: result.usedFallback,
  });

  if (result.usedFallback) {
    await emitFaceScoreUnavailableEvent({
      session: context.session,
      attemptId,
    });
  }

  return resolveSelfieVerdict(context, attemptId, result);
}
