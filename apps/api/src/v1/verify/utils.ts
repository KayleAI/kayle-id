import type { ERROR_MESSAGES } from "@kayle-id/config/error-messages";

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
  server.send(
    JSON.stringify({
      type: "error",
      error: { code, message },
    })
  );
  server.close(1000, message);
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
