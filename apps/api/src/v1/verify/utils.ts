import { encodeServerError } from "@kayle-id/capnp/verify-codec";
import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import type { Context } from "hono";

type WebSocketPairFactory = new () => {
  0: WebSocket;
  1: WebSocket;
};

function getWebSocketPairFactory(): WebSocketPairFactory {
  const factory = (globalThis as { WebSocketPair?: WebSocketPairFactory })
    .WebSocketPair;

  if (!factory) {
    throw new Error("WebSocketPair is not available in this runtime.");
  }

  return factory;
}

export function createWebSocketPairTuple(): [WebSocket, WebSocket] {
  const PairFactory = getWebSocketPairFactory();
  const pair = new PairFactory();
  return [pair[0], pair[1]];
}

/**
 * Return a WebSocket error response.
 *
 * @param {code} string - The error code to return.
 * @param {message} string - The error message to return.
 * @returns {Response} - The response to return.
 */
export function webSocketErrorResponse({
  code,
  message,
}: {
  code: keyof typeof ERROR_MESSAGES;
  message?: string;
}): Response {
  const [client, server] = createWebSocketPairTuple();
  server.accept();
  const resolvedMessage = message ?? ERROR_MESSAGES[code]?.description ?? code;
  server.send(encodeServerError(code, resolvedMessage));
  server.close(1000, resolvedMessage);
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

export function newRpcResponse(
  _c: Context,
  _rpc: unknown
): Response | Promise<Response> {
  return new Response("RPC no longer supported on this endpoint.", {
    status: 410,
  });
}
