import { decodeClientMessage } from "@kayle-id/capnp/verify-codec";
import { logSafeError } from "@kayle-id/config/logging";
import type { Context } from "hono";
import {
  emitRequestLog,
  getRequestLogger,
  markRequestLogForManualEmit,
} from "@/logging";
import { waitUntilIfAvailable } from "@/utils/wait-until";
import { releaseAttemptConnection } from "./attempt-connection";
import { resetTransferState } from "./data-payload";
import type { ActiveVerifySessionContext } from "./session-context";
import {
  createVerifySocketState,
  type VerifySocketContext,
} from "./socket-context";
import { handleDataMessage } from "./socket-data";
import { handleHelloMessage } from "./socket-hello";
import { handlePhaseMessage } from "./socket-phase";
import { handleShareSelectionMessage } from "./socket-share";
import { createVerifySocketTransport } from "./socket-transport";
import { createWebSocketPairTuple } from "./utils";

async function getBytesFromEvent(
  event: MessageEvent
): Promise<Uint8Array | undefined> {
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
}

export function startVerifySocketSession(
  c: Context<{ Bindings: CloudflareBindings }>,
  activeSession: ActiveVerifySessionContext
): Response {
  const debug = c.req.query("debug") === "1";
  const connectionOwnerId = crypto.randomUUID();
  const log = getRequestLogger(c);
  const [client, server] = createWebSocketPairTuple();
  server.accept();
  markRequestLogForManualEmit(c);
  log.set({
    event: "verify.ws.opened",
    organization_id: activeSession.session.organizationId,
    session_id: activeSession.session.id,
    websocket_debug: debug,
  });

  const context: VerifySocketContext = {
    connectionOwnerId,
    env: c.env,
    log,
    scheduleTask: (task) =>
      waitUntilIfAvailable({
        createTask: () => task,
        getExecutionCtx: () => c.executionCtx,
      }),
    session: activeSession.session,
    shareRequestPayload: activeSession.shareRequestPayload,
    state: createVerifySocketState(),
    transport: createVerifySocketTransport({ debug, log, server }),
  };

  const handleDecodedMessage = async (
    decoded: NonNullable<ReturnType<typeof decodeClientMessage>>
  ) => {
    if (decoded.hello) {
      await handleHelloMessage(context, decoded.hello);
      return;
    }

    if (!context.state.helloReceived) {
      context.transport.sendError(
        "HELLO_REQUIRED",
        "Send hello before other messages."
      );
      return;
    }

    if (decoded.phase) {
      await handlePhaseMessage(context, decoded.phase);
      return;
    }

    if (decoded.data) {
      handleDataMessage(context, decoded.data);
      return;
    }

    if (decoded.shareSelection) {
      await handleShareSelectionMessage(context, decoded.shareSelection);
    }
  };

  server.addEventListener("message", (event) => {
    getBytesFromEvent(event)
      .then((bytes) => {
        if (!bytes) {
          context.transport.logDebug("recv_invalid_message");
          context.transport.sendError(
            "INVALID_MESSAGE",
            "Binary protobuf messages are required."
          );
          return null;
        }

        const decoded = decodeClientMessage(bytes);
        if (!decoded) {
          context.transport.logDebug("recv_decode_failed", {
            size: bytes.length,
          });
          context.transport.sendError(
            "DECODE_FAILED",
            "Failed to decode protobuf message."
          );
          return null;
        }

        return handleDecodedMessage(decoded);
      })
      .catch((error) => {
        logSafeError(log, {
          code: "verify_ws_internal_error",
          error,
          event: "verify.ws.internal_error",
          message: "WebSocket message handling failed.",
          status: 500,
        });
        context.transport.sendError(
          "INTERNAL_ERROR",
          error instanceof Error
            ? error.message
            : "Unknown websocket handling error."
        );
        context.transport.closeSocket(1011, "INTERNAL_ERROR");
      });
  });

  server.addEventListener("close", (event) => {
    log.set({
      socket_close_code: event.code,
      socket_closed: true,
    });

    if (log.getContext().event === "verify.ws.opened") {
      log.set({
        event: "verify.ws.closed",
      });
    }

    if (context.state.attemptId) {
      releaseAttemptConnection({
        attemptId: context.state.attemptId,
        ownerId: connectionOwnerId,
      });
    }

    resetTransferState(context.state.transfer);
    emitRequestLog(c, 101);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
