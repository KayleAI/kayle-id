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
  isTrackedAttemptPhase,
  persistTrackedAttemptPhase,
  validateTrackedPhaseTransition,
} from "./phase-state";
import { isTerminalSessionStatus } from "./status";
import { createWebSocketPairTuple, webSocketErrorResponse } from "./utils";

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

    const verifyAuthenticityStub = () => ({ ok: true });

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

    const handlePhase = async (payload: { phase?: string; error?: string }) => {
      logDebug("recv_phase", {
        phase: payload.phase ?? "",
        error: payload.error ?? "",
      });

      if (!state.attemptId) {
        sendError("HELLO_REQUIRED", "Send hello before other messages.");
        return;
      }

      const nextPhase = payload.phase?.trim() ?? "";
      if (!isTrackedAttemptPhase(nextPhase)) {
        sendAck("phase_ok");
        return;
      }

      const transition = validateTrackedPhaseTransition({
        currentPhase: state.currentPhase,
        nextPhase,
      });

      if (!transition.ok) {
        sendError(transition.code, resolveErrorMessage(transition.code));
        return;
      }

      if (transition.changed) {
        await persistTrackedAttemptPhase({
          attemptId: state.attemptId,
          phase: transition.nextPhase,
        });
        state.currentPhase = transition.nextPhase;
      }

      sendAck("phase_ok");
    };

    const handleData = (payload: {
      kind?: number;
      raw?: Uint8Array;
      index?: number;
      total?: number;
      chunkIndex?: number;
      chunkTotal?: number;
    }) => {
      logDebug("recv_data", {
        kind: payload.kind ?? 0,
        size: payload.raw?.length ?? 0,
        index: payload.index ?? 0,
        total: payload.total ?? 0,
        chunkIndex: payload.chunkIndex ?? 0,
        chunkTotal: payload.chunkTotal ?? 0,
      });

      const result = processDataPayload({
        state: state.transfer,
        payload,
      });

      if (result.error) {
        sendError(result.error.code, result.error.message);
        return;
      }

      for (const ack of result.acks) {
        sendAck(ack);
      }

      if (result.authenticityReady) {
        const authenticityResult = verifyAuthenticityStub();
        if (!authenticityResult.ok) {
          sendError("AUTH_FAILED", "Authenticity verification failed.");
        }
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
