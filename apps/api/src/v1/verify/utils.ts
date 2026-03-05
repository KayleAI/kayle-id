import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import type { Context } from "hono";
import { encodeServerError } from "./proto";

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
  // biome-ignore lint/correctness/noUndeclaredVariables: This is a Cloudflare Worker's global
  const [client, server] = Object.values(new WebSocketPair());
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
