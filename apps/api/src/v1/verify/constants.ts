/**
 * Crypto version for E2EE envelope compatibility.
 * This identifies the cryptographic protocol used.
 */
export const CRYPTO_VERSION = "ecdh-p256-aes256gcm-v1" as const;

/**
 * Build the WebSocket relay URL for a session.
 */
export function buildRelayWsUrl(sessionId: string, attemptId: string): string {
  const protocol = process.env.NODE_ENV === "production" ? "wss" : "ws";
  const host =
    process.env.NODE_ENV === "production" ? "api.kayle.id" : "localhost:8787";

  return `${protocol}://${host}/v1/verify/ws/${sessionId}?attemptId=${attemptId}&clientType=desktop`;
}
