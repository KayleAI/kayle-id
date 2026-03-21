import {
  encodeServerAck,
  encodeServerError,
  encodeServerShareReady,
  encodeServerShareRequest,
  encodeServerVerdict,
  type VerifyServerVerdict,
  type VerifyShareRequest,
} from "@kayle-id/capnp/verify-codec";
import { logEvent } from "@kayle-id/config/logging";
import type { ApiRequestLogger } from "@/logging";
import { resolveVerifyErrorMessage } from "./error-response";
import type { VerifySocketTransport } from "./socket-context";

export function createVerifySocketTransport({
  debug,
  log,
  server,
}: {
  debug: boolean;
  log: ApiRequestLogger;
  server: WebSocket;
}): VerifySocketTransport {
  const logDebug = (label: string, details?: Record<string, unknown>) => {
    if (!debug) {
      return;
    }

    logEvent(log, {
      details,
      event: `verify.ws.${label}`,
    });
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
    selectedFieldKeys: string[];
    sessionId: string;
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

  const closeSocket = (code: number, reason: string) => {
    server.close(code, reason);
  };

  return {
    closeAfterVerdict: (code: string) => {
      setTimeout(() => {
        closeSocket(1008, code);
      }, 0);
    },
    closeSocket,
    logDebug,
    sendAck,
    sendAuthErrorAndClose: (code) => {
      const message = resolveVerifyErrorMessage(code);
      logEvent(log, {
        details: {
          error_code: code,
          error_message: message,
        },
        event: `verify.ws.auth_error.${code}`,
        level: "warn",
      });
      sendError(code, message);
      closeSocket(1008, code);
    },
    sendError,
    sendShareReady,
    sendShareRequest,
    sendVerdict,
  };
}
