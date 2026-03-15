import {
  decodeClientMessage,
  encodeServerAck,
  encodeServerError,
  encodeServerShareReady,
  encodeServerShareRequest,
  encodeServerVerdict,
  type VerifyServerVerdict,
  type VerifyShareRequest,
} from "@kayle-id/capnp/verify-codec";
import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import { db } from "@kayle-id/database/drizzle";
import { verification_sessions } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { sessionIdSchema } from "@/shared/validation";
import {
  claimAttemptConnection,
  releaseAttemptConnection,
} from "./attempt-connection";
import {
  createTransferState,
  getNfcTransferStatus,
  getSelfieTransferStatus,
  isNfcDataKind,
  isSelfieDataKind,
  processDataPayload,
  resetTransferState,
} from "./data-payload";
import { matchFaces } from "./face-matcher-client";
import { issueHandoffPayload } from "./handoff";
import {
  consumeHelloAttempt,
  getAttemptForHello,
  isAttemptMissingOrTerminal,
  markSessionInProgress,
  parseHelloPayload,
  resolveHelloAuthState,
} from "./hello-auth";
import {
  emitFaceScoreUnavailableEvent,
  MAX_FAILED_ATTEMPTS,
  markAttemptFailed,
  markAttemptSucceeded,
} from "./outcome";
import {
  isTrackedAttemptPhase,
  persistTrackedAttemptPhase,
  validateTrackedPhaseTransition,
} from "./phase-state";
import {
  createShareRequestPayload,
  type VerifyShareManifest,
  validateAndBuildShareManifest,
} from "./share-manifest";
import { isTerminalSessionStatus } from "./status";
import { createWebSocketPairTuple, webSocketErrorResponse } from "./utils";
import { validateAuthenticity } from "./validation";
import type { FaceScoreResult } from "./validation-types";
import { configureVerifyAssetFetcherFromEnv } from "./verify-assets";

const verify = new Hono<{ Bindings: CloudflareBindings }>();
const handoffParamSchema = z.object({ id: sessionIdSchema });

function resolveErrorMessage(code: keyof typeof ERROR_MESSAGES): string {
  return ERROR_MESSAGES[code]?.description ?? code;
}

function jsonErrorResponse({
  code,
  status,
}: {
  code: keyof typeof ERROR_MESSAGES;
  status: 400 | 404 | 409 | 410;
}) {
  return {
    data: null,
    error: {
      code,
      message: ERROR_MESSAGES[code].description,
    },
    status,
  } as const;
}

verify.post(
  "/session/:id/handoff",
  validator("param", (value, c) => {
    const parsed = handoffParamSchema.safeParse(value);

    if (!parsed.success) {
      const response = jsonErrorResponse({
        code: "INVALID_SESSION_ID",
        status: 400,
      });

      return c.json(
        {
          data: response.data,
          error: response.error,
        },
        response.status
      );
    }

    return parsed.data;
  }),
  async (c) => {
    const { id } = c.req.valid("param");

    const handoff = await issueHandoffPayload(id);

    if (!handoff.ok) {
      const response = jsonErrorResponse({
        code: handoff.error.code,
        status: handoff.error.status,
      });

      return c.json(
        {
          data: response.data,
          error: response.error,
        },
        response.status
      );
    }

    return c.json(
      {
        data: handoff.data,
        error: null,
      },
      200
    );
  }
);

verify.get(
  "/session/:id",
  validator("param", (value) => {
    const parsed = z.object({ id: sessionIdSchema }).safeParse(value);

    if (!parsed.success) {
      return webSocketErrorResponse({
        code: "INVALID_SESSION_ID",
      });
    }

    return parsed.data;
  }),
  async (c) => {
    configureVerifyAssetFetcherFromEnv(c.env);

    const { id } = c.req.valid("param");

    const [session] = await db
      .select({
        id: verification_sessions.id,
        organizationId: verification_sessions.organizationId,
        environment: verification_sessions.environment,
        status: verification_sessions.status,
        contractVersion: verification_sessions.contractVersion,
        shareFields: verification_sessions.shareFields,
        redirectUrl: verification_sessions.redirectUrl,
        expiresAt: verification_sessions.expiresAt,
        completedAt: verification_sessions.completedAt,
        createdAt: verification_sessions.createdAt,
        updatedAt: verification_sessions.updatedAt,
      })
      .from(verification_sessions)
      .where(eq(verification_sessions.id, id))
      .limit(1);

    if (!session) {
      return webSocketErrorResponse({
        code: "SESSION_NOT_FOUND",
      });
    }

    if (
      isTerminalSessionStatus(session.status) ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return webSocketErrorResponse({
        code: "SESSION_EXPIRED",
      });
    }

    const shareRequestPayload = createShareRequestPayload({
      contractVersion: session.contractVersion,
      sessionId: session.id,
      shareFieldsInput: session.shareFields,
    });

    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
      return c.json(
        {
          error: {
            code: "WEBSOCKET_REQUIRED",
            message: "This endpoint requires a WebSocket connection.",
          },
        },
        426
      );
    }

    const [client, server] = createWebSocketPairTuple();
    server.accept();

    const debug = c.req.query("debug") === "1";
    const connectionOwnerId = crypto.randomUUID();

    const state = {
      helloReceived: false,
      transfer: createTransferState(),
      attemptId: null as string | null,
      currentPhase: null as string | null,
      shareManifest: null as VerifyShareManifest | null,
      shareRequestSent: false,
    };

    const logDebug = (label: string, details?: Record<string, unknown>) => {
      if (!debug) {
        return;
      }

      console.info(
        JSON.stringify({
          event: `verify.ws.${label}`,
          ...details,
        })
      );
    };

    const logFaceScoreResult = ({
      attemptId,
      result,
    }: {
      attemptId: string;
      result: FaceScoreResult;
    }) => {
      console.info(
        JSON.stringify({
          event: "verify.ws.face_score_evaluated",
          attempt_id: attemptId,
          face_score: result.faceScore,
          passed: result.passed,
          reason: result.reason ?? null,
          used_fallback: result.usedFallback,
        })
      );
    };

    const sendAck = (message: string) => {
      logDebug("send_ack", { message });
      server.send(encodeServerAck(message));
    };

    const sendError = (code: string, message: string) => {
      logDebug("send_error", { code, message });
      server.send(encodeServerError(code, message));
    };

    const sendVerdict = (verdict: VerifyServerVerdict) => {
      logDebug("send_verdict", verdict);
      server.send(encodeServerVerdict(verdict));
    };

    const sendShareRequest = (shareRequest: VerifyShareRequest) => {
      logDebug("send_share_request", {
        contractVersion: shareRequest.contractVersion,
        fieldCount: shareRequest.fields.length,
      });
      server.send(encodeServerShareRequest(shareRequest));
    };

    const sendShareReady = ({
      selectedFieldKeys,
      sessionId,
    }: {
      sessionId: string;
      selectedFieldKeys: string[];
    }) => {
      logDebug("send_share_ready", {
        fieldCount: selectedFieldKeys.length,
        sessionId,
      });
      server.send(
        encodeServerShareReady({
          sessionId,
          selectedFieldKeys,
        })
      );
    };

    const closeAfterVerdict = (code: string) => {
      setTimeout(() => {
        server.close(1008, code);
      }, 0);
    };

    const sendAuthErrorAndClose = (code: keyof typeof ERROR_MESSAGES) => {
      const message = resolveErrorMessage(code);
      sendError(code, message);
      server.close(1008, code);
    };

    const getBytesFromEvent = async (
      event: MessageEvent
    ): Promise<Uint8Array | undefined> => {
      if (typeof event.data === "string") {
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        return new Uint8Array(event.data);
      }
      if (event.data instanceof Uint8Array) {
        return event.data;
      }
      if (event.data instanceof Blob) {
        return new Uint8Array(await event.data.arrayBuffer());
      }
      return;
    };

    const acknowledgeHello = () => {
      state.helloReceived = true;
      sendAck("hello_ok");
    };

    const shouldRejectSocketAttemptSwitch = (attemptId: string): boolean => {
      if (
        !(
          state.helloReceived &&
          state.attemptId &&
          state.attemptId !== attemptId
        )
      ) {
        return false;
      }

      sendAuthErrorAndClose("HELLO_AUTH_REQUIRED");
      return true;
    };

    const claimAttemptOwnership = (attemptId: string): boolean => {
      const ownership = claimAttemptConnection({
        attemptId,
        ownerId: connectionOwnerId,
      });

      if (ownership.ok) {
        return true;
      }

      sendAuthErrorAndClose(ownership.code);
      return false;
    };

    const clearAttemptStateAndOwnership = (attemptId: string) => {
      releaseAttemptConnection({
        attemptId,
        ownerId: connectionOwnerId,
      });
      state.attemptId = null;
      state.currentPhase = null;
      state.shareManifest = null;
      state.shareRequestSent = false;
    };

    const persistConnectedPhaseIfMissing = async (attemptId: string) => {
      if (state.currentPhase) {
        return;
      }

      await persistTrackedAttemptPhase({
        attemptId,
        phase: "mobile_connected",
      });
      state.currentPhase = "mobile_connected";
    };

    const consumeFirstHello = async ({
      attemptId,
      deviceIdHash,
      appVersion,
    }: {
      attemptId: string;
      deviceIdHash: string;
      appVersion: string;
    }) => {
      await consumeHelloAttempt({
        attemptId,
        deviceIdHash,
        appVersion,
      });
      await markSessionInProgress(session);
      await persistTrackedAttemptPhase({
        attemptId,
        phase: "mobile_connected",
      });
      state.currentPhase = "mobile_connected";
    };

    const handleHello = async (payload: {
      attemptId?: string;
      mobileWriteToken?: string;
      deviceId?: string;
      appVersion?: string;
    }) => {
      const parsed = parseHelloPayload(payload);

      logDebug("recv_hello", {
        attemptIdPresent: Boolean(parsed?.attemptId),
        mobileWriteTokenPresent: Boolean(parsed?.mobileWriteToken),
        deviceIdPresent: Boolean(parsed?.deviceId),
      });

      if (!parsed) {
        sendAuthErrorAndClose("HELLO_AUTH_REQUIRED");
        return;
      }

      const attempt = await getAttemptForHello(session.id, parsed.attemptId);

      if (isAttemptMissingOrTerminal(attempt)) {
        sendAuthErrorAndClose("ATTEMPT_NOT_FOUND");
        return;
      }

      if (shouldRejectSocketAttemptSwitch(attempt.id)) {
        return;
      }

      const authState = await resolveHelloAuthState({
        attempt,
        mobileWriteToken: parsed.mobileWriteToken,
        deviceId: parsed.deviceId,
        nowMs: Date.now(),
      });

      if (authState.kind === "error") {
        sendAuthErrorAndClose(authState.code);
        return;
      }

      if (!claimAttemptOwnership(attempt.id)) {
        return;
      }

      state.attemptId = attempt.id;
      state.currentPhase = attempt.currentPhase ?? null;
      state.shareManifest = null;
      state.shareRequestSent = false;

      if (authState.kind === "resume") {
        await persistConnectedPhaseIfMissing(attempt.id);
        acknowledgeHello();
        return;
      }

      try {
        await consumeFirstHello({
          attemptId: attempt.id,
          deviceIdHash: authState.deviceIdHash,
          appVersion: parsed.appVersion,
        });
      } catch (error) {
        clearAttemptStateAndOwnership(attempt.id);
        throw error;
      }

      acknowledgeHello();
    };

    const createMissingNfcMessage = () => {
      const nfcStatus = getNfcTransferStatus(state.transfer);
      return {
        complete: nfcStatus.complete,
        message: JSON.stringify({
          missing_artifacts: nfcStatus.missingArtifacts,
          missing_chunks: nfcStatus.missingChunks.map((chunk) => ({
            kind: chunk.kind,
            index: chunk.index,
            chunk_total: chunk.chunkTotal,
            missing_chunk_indices: chunk.missingChunkIndices,
          })),
        }),
      };
    };

    const createMissingSelfieMessage = () => {
      const selfieStatus = getSelfieTransferStatus(state.transfer);
      return {
        complete: selfieStatus.complete,
        message: JSON.stringify({
          required_total: selfieStatus.requiredTotal,
          missing_selfie_indexes: selfieStatus.missingSelfieIndexes,
          missing_chunks: selfieStatus.missingChunks.map((chunk) => ({
            kind: chunk.kind,
            index: chunk.index,
            chunk_total: chunk.chunkTotal,
            missing_chunk_indices: chunk.missingChunkIndices,
          })),
        }),
      };
    };

    const ensureNfcDataReadyForCompletion = (nextPhase: string): boolean => {
      if (nextPhase !== "nfc_complete") {
        return true;
      }

      const nfcStatus = createMissingNfcMessage();
      if (nfcStatus.complete) {
        return true;
      }

      sendError("NFC_REQUIRED_DATA_MISSING", nfcStatus.message);
      return false;
    };

    const ensureSelfieDataReadyForCompletion = (nextPhase: string): boolean => {
      if (nextPhase !== "selfie_complete") {
        return true;
      }

      const selfieStatus = createMissingSelfieMessage();
      if (selfieStatus.complete) {
        return true;
      }

      sendError("SELFIE_REQUIRED_DATA_MISSING", selfieStatus.message);
      return false;
    };

    const resolveTrackedPhaseTransition = (nextPhase: string) => {
      const transition = validateTrackedPhaseTransition({
        currentPhase: state.currentPhase,
        nextPhase,
      });

      if (!transition.ok) {
        sendError(transition.code, resolveErrorMessage(transition.code));
        return null;
      }

      return transition;
    };

    const persistTrackedPhase = async ({
      transition,
      attemptId,
    }: {
      transition: NonNullable<ReturnType<typeof resolveTrackedPhaseTransition>>;
      attemptId: string;
    }): Promise<void> => {
      if (!transition.changed) {
        return;
      }

      await persistTrackedAttemptPhase({
        attemptId,
        phase: transition.nextPhase,
      });
      state.currentPhase = transition.nextPhase;
    };

    const rejectValidationAndClose = async ({
      attemptId,
      code,
      riskScore,
    }: {
      attemptId: string;
      code: "passport_authenticity_failed" | "selfie_face_mismatch";
      riskScore: number;
    }): Promise<VerifyServerVerdict> => {
      const result = await markAttemptFailed({
        session,
        attemptId,
        failureCode: code,
        riskScore,
      });

      const remainingAttempts = Math.max(
        0,
        MAX_FAILED_ATTEMPTS - result.failedAttempts
      );

      return {
        outcome: "rejected",
        reasonCode: code,
        reasonMessage: resolveErrorMessage(code),
        retryAllowed: !result.terminalized,
        remainingAttempts,
      };
    };

    const ensureNfcAuthenticity = async (
      attemptId: string
    ): Promise<VerifyServerVerdict | null> => {
      const { dg1, dg2, sod } = state.transfer;
      if (!(dg1 && dg2 && sod)) {
        return null;
      }

      const authenticity = await validateAuthenticity({
        dg1,
        dg2,
        sod,
      });

      if (authenticity.ok) {
        return null;
      }

      const verdict = await rejectValidationAndClose({
        attemptId,
        code: "passport_authenticity_failed",
        riskScore: 1,
      });
      sendVerdict(verdict);
      closeAfterVerdict(verdict.reasonCode);
      return verdict;
    };

    const ensureSelfieMatch = async (
      attemptId: string
    ): Promise<VerifyServerVerdict | null> => {
      const { dg2 } = state.transfer;
      if (!dg2) {
        return null;
      }

      const selfies = Array.from(state.transfer.selfies.values());
      const faceResult = await matchFaces({
        dg2Image: dg2,
        selfies,
        env: c.env,
        attemptId,
      });
      logFaceScoreResult({
        attemptId,
        result: faceResult,
      });

      if (faceResult.usedFallback) {
        await emitFaceScoreUnavailableEvent({
          session,
          attemptId,
        });
      }

      if (!faceResult.passed) {
        const verdict = await rejectValidationAndClose({
          attemptId,
          code: "selfie_face_mismatch",
          riskScore: faceResult.usedFallback
            ? 1
            : 1 - (faceResult.faceScore ?? 0),
        });
        sendVerdict(verdict);
        closeAfterVerdict(verdict.reasonCode);
        return verdict;
      }

      if (typeof faceResult.faceScore !== "number") {
        throw new Error("face_score_required_for_success");
      }

      await markAttemptSucceeded({
        session,
        attemptId,
        faceScore: faceResult.faceScore,
      });

      return {
        outcome: "accepted",
        reasonCode: "",
        reasonMessage: "",
        retryAllowed: false,
        remainingAttempts: 0,
      };
    };

    const resolvePhaseContext = (payload: {
      phase?: string;
      error?: string;
    }) => {
      const attemptId = state.attemptId;
      if (!attemptId) {
        sendError("HELLO_REQUIRED", "Send hello before other messages.");
        return null;
      }

      const nextPhase = payload.phase?.trim() ?? "";
      if (!isTrackedAttemptPhase(nextPhase)) {
        sendAck("phase_ok");
        return null;
      }

      return {
        attemptId,
        nextPhase,
      };
    };

    const validateCompletionRequirements = (nextPhase: string): boolean => {
      if (!ensureNfcDataReadyForCompletion(nextPhase)) {
        return false;
      }

      if (!ensureSelfieDataReadyForCompletion(nextPhase)) {
        return false;
      }

      return true;
    };

    const runPhaseValidation = ({
      attemptId,
      nextPhase,
    }: {
      attemptId: string;
      nextPhase: string;
    }): Promise<VerifyServerVerdict | null> => {
      if (nextPhase === "nfc_complete") {
        return ensureNfcAuthenticity(attemptId);
      }

      if (nextPhase === "selfie_complete") {
        return ensureSelfieMatch(attemptId);
      }

      return Promise.resolve(null);
    };

    const handlePhase = async (payload: { phase?: string; error?: string }) => {
      logDebug("recv_phase", {
        phase: payload.phase ?? "",
        error: payload.error ?? "",
      });

      const context = resolvePhaseContext(payload);
      if (!context) {
        return;
      }

      if (!validateCompletionRequirements(context.nextPhase)) {
        return;
      }

      const transition = resolveTrackedPhaseTransition(context.nextPhase);
      if (!transition) {
        return;
      }

      const verdict = await runPhaseValidation({
        attemptId: context.attemptId,
        nextPhase: context.nextPhase,
      });
      if (
        verdict?.outcome === "rejected" ||
        (context.nextPhase === "nfc_complete" && verdict)
      ) {
        return;
      }

      await persistTrackedPhase({
        transition,
        attemptId: context.attemptId,
      });

      if (context.nextPhase === "selfie_complete" && verdict) {
        sendVerdict(verdict);
        sendShareRequest(shareRequestPayload);
        state.shareRequestSent = true;
        return;
      }

      sendAck("phase_ok");
    };

    const isNfcDataPhaseMismatch = (kind: number): boolean =>
      isNfcDataKind(kind) && state.currentPhase !== "nfc_reading";

    const isSelfieDataPhaseMismatch = (kind: number): boolean =>
      isSelfieDataKind(kind) && state.currentPhase !== "selfie_capturing";

    const acknowledgeDataResult = (
      result: ReturnType<typeof processDataPayload>
    ) => {
      for (const ack of result.acks) {
        sendAck(ack);
      }
    };

    const handleData = (payload: {
      kind?: number;
      raw?: Uint8Array;
      index?: number;
      total?: number;
      chunkIndex?: number;
      chunkTotal?: number;
    }) => {
      const kind = payload.kind ?? 0;

      logDebug("recv_data", {
        kind,
        size: payload.raw?.length ?? 0,
        index: payload.index ?? 0,
        total: payload.total ?? 0,
        chunkIndex: payload.chunkIndex ?? 0,
        chunkTotal: payload.chunkTotal ?? 0,
      });

      if (isNfcDataPhaseMismatch(kind)) {
        sendError(
          "NFC_DATA_PHASE_REQUIRED",
          resolveErrorMessage("NFC_DATA_PHASE_REQUIRED")
        );
        return;
      }

      if (isSelfieDataPhaseMismatch(kind)) {
        sendError(
          "SELFIE_DATA_PHASE_REQUIRED",
          resolveErrorMessage("SELFIE_DATA_PHASE_REQUIRED")
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
        sendError(result.error.code, result.error.message);
        return;
      }

      acknowledgeDataResult(result);
    };

    const handleShareSelection = async (payload: {
      sessionId?: string;
      selectedFieldKeys?: string[];
    }) => {
      logDebug("recv_share_selection", {
        selectedFieldCount: payload.selectedFieldKeys?.length ?? 0,
        sessionIdPresent: Boolean(payload.sessionId),
      });

      if (!(state.helloReceived && state.attemptId && state.shareRequestSent)) {
        sendError(
          "PHASE_OUT_OF_ORDER",
          resolveErrorMessage("PHASE_OUT_OF_ORDER")
        );
        return;
      }

      const { dg1, dg2 } = state.transfer;
      if (!(dg1 && dg2)) {
        sendError(
          "PHASE_OUT_OF_ORDER",
          resolveErrorMessage("PHASE_OUT_OF_ORDER")
        );
        return;
      }

      const result = await validateAndBuildShareManifest({
        contractVersion: session.contractVersion,
        dg1,
        dg2,
        organizationId: session.organizationId,
        selectedFieldKeysInput: payload.selectedFieldKeys,
        sessionId: session.id,
        submittedSessionId: payload.sessionId,
        shareFieldsInput: session.shareFields,
      });

      if (!result.ok) {
        sendError(result.code, result.message);
        return;
      }

      state.shareManifest = result.manifest;
      sendShareReady(result.shareReady);
    };

    const handleDecodedMessage = async (
      decoded: NonNullable<ReturnType<typeof decodeClientMessage>>
    ) => {
      if (decoded.hello) {
        await handleHello(decoded.hello);
        return;
      }

      if (!state.helloReceived) {
        sendError("HELLO_REQUIRED", "Send hello before other messages.");
        return;
      }

      if (decoded.phase) {
        await handlePhase(decoded.phase);
        return;
      }

      if (decoded.data) {
        handleData(decoded.data);
        return;
      }

      if (decoded.shareSelection) {
        await handleShareSelection(decoded.shareSelection);
      }
    };

    const handleMessage = async (event: MessageEvent) => {
      const bytes = await getBytesFromEvent(event);

      if (!bytes) {
        logDebug("recv_invalid_message");
        sendError("INVALID_MESSAGE", "Binary protobuf messages are required.");
        return;
      }

      const decoded = decodeClientMessage(bytes);

      if (!decoded) {
        logDebug("recv_decode_failed", { size: bytes.length });
        sendError("DECODE_FAILED", "Failed to decode protobuf message.");
        return;
      }

      await handleDecodedMessage(decoded);
    };

    const handleMessageFailure = (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown websocket handling error.";

      sendError("INTERNAL_ERROR", message);
      server.close(1011, "INTERNAL_ERROR");
    };

    server.addEventListener("message", (event) => {
      handleMessage(event).catch(handleMessageFailure);
    });

    server.addEventListener("close", () => {
      if (state.attemptId) {
        releaseAttemptConnection({
          attemptId: state.attemptId,
          ownerId: connectionOwnerId,
        });
      }
      resetTransferState(state.transfer);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
);

export default verify;
