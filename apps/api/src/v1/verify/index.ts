import {
  decodeClientMessage,
  encodeServerAck,
  encodeServerError,
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
  emitFaceScoreFallbackEvent,
  markAttemptFailed,
  markAttemptSucceeded,
} from "./outcome";
import {
  isTrackedAttemptPhase,
  persistTrackedAttemptPhase,
  validateTrackedPhaseTransition,
} from "./phase-state";
import { isTerminalSessionStatus } from "./status";
import { createWebSocketPairTuple, webSocketErrorResponse } from "./utils";
import {
  computeFaceScore,
  configureVerifyAssetFetcher,
  validateAuthenticity,
} from "./validation";

const verify = new Hono<{ Bindings: CloudflareBindings }>();
type WorkerAssetBinding = {
  fetch: typeof fetch;
};

const handoffParamSchema = z.object({ id: sessionIdSchema });

function getWorkerAssetBinding(env: unknown): WorkerAssetBinding | null {
  if (!env || typeof env !== "object") {
    return null;
  }

  const candidate = Reflect.get(env, "ASSETS");

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const fetchBinding = Reflect.get(candidate, "fetch");

  return typeof fetchBinding === "function"
    ? {
        fetch: fetchBinding as typeof fetch,
      }
    : null;
}

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
    const assetBinding = getWorkerAssetBinding(c.env);

    if (assetBinding) {
      configureVerifyAssetFetcher(async (pathname) => {
        const request = new Request(
          new URL(pathname, "https://assets.kayle.id").toString()
        );
        const response = await assetBinding.fetch(request);

        if (!response.ok) {
          throw new Error(`asset_fetch_failed:${pathname}`);
        }

        return new Uint8Array(await response.arrayBuffer());
      });
    } else {
      configureVerifyAssetFetcher(null);
    }

    const { id } = c.req.valid("param");

    const [session] = await db
      .select({
        id: verification_sessions.id,
        organizationId: verification_sessions.organizationId,
        environment: verification_sessions.environment,
        status: verification_sessions.status,
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

    const sendAck = (message: string) => {
      logDebug("send_ack", { message });
      server.send(encodeServerAck(message));
    };

    const sendError = (code: string, message: string) => {
      logDebug("send_error", { code, message });
      server.send(encodeServerError(code, message));
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
    }): Promise<void> => {
      await markAttemptFailed({
        session,
        attemptId,
        failureCode: code,
        riskScore,
      });
      sendError(code, resolveErrorMessage(code));
      server.close(1008, code);
    };

    const ensureNfcAuthenticity = async (
      attemptId: string
    ): Promise<boolean> => {
      const { dg1, dg2, sod } = state.transfer;
      if (!(dg1 && dg2 && sod)) {
        return false;
      }

      const authenticity = await validateAuthenticity({
        dg1,
        dg2,
        sod,
      });

      if (authenticity.ok) {
        return true;
      }

      await rejectValidationAndClose({
        attemptId,
        code: "passport_authenticity_failed",
        riskScore: 1,
      });

      return false;
    };

    const ensureSelfieMatch = async (attemptId: string): Promise<boolean> => {
      const { dg2 } = state.transfer;
      if (!dg2) {
        return false;
      }

      const selfies = Array.from(state.transfer.selfies.values());
      const faceResult = await computeFaceScore({
        dg2Image: dg2,
        selfies,
      });

      if (faceResult.usedFallback) {
        await emitFaceScoreFallbackEvent({
          session,
          attemptId,
        });

        await markAttemptSucceeded({
          session,
          attemptId,
          riskScore: 1,
        });

        return true;
      }

      const faceScore = faceResult.faceScore ?? 1;
      if (!faceResult.passed) {
        await rejectValidationAndClose({
          attemptId,
          code: "selfie_face_mismatch",
          riskScore: 1 - faceScore,
        });
        return false;
      }

      await markAttemptSucceeded({
        session,
        attemptId,
        faceScore,
      });

      return true;
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
    }): Promise<boolean> => {
      if (nextPhase === "nfc_complete") {
        return ensureNfcAuthenticity(attemptId);
      }

      if (nextPhase === "selfie_complete") {
        return ensureSelfieMatch(attemptId);
      }

      return Promise.resolve(true);
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

      const passedValidation = await runPhaseValidation({
        attemptId: context.attemptId,
        nextPhase: context.nextPhase,
      });
      if (!passedValidation) {
        return;
      }

      await persistTrackedPhase({
        transition,
        attemptId: context.attemptId,
      });
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
      }
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
