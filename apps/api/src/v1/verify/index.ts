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

    const state = {
      helloReceived: false,
      transfer: createTransferState(),
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

      if (authState.kind === "resume") {
        acknowledgeHello();
        return;
      }

      await consumeHelloAttempt({
        attemptId: attempt.id,
        deviceIdHash: authState.deviceIdHash,
        appVersion: parsed.appVersion,
      });
      await markSessionInProgress(session);

      acknowledgeHello();
    };

    const handlePhase = (payload: { phase?: string; error?: string }) => {
      logDebug("recv_phase", {
        phase: payload.phase ?? "",
        error: payload.error ?? "",
      });
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
        handlePhase(decoded.phase);
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
      resetTransferState(state.transfer);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
);

export default verify;
