import type { VerifySession } from "@api/shared/verify";
import { newWebSocketRpcSession } from "capnweb";
import { env } from "@/config/env";

/**
 * Initialise a connection to a Kayle ID session.
 *
 * This function will return a new WebSocket RPC session for the given session ID.
 *
 * @note When initialising the session via this function, use the `using` keyword to ensure the session is closed when the component unmounts.
 *
 * @param sessionId - The ID of the session to connect to.
 * @param onBroken - Optional callback for handling RPC broken events.
 *
 * @returns A new WebSocket RPC session for the given session ID.
 */
export function initialiseSession(
  sessionId: string,
  onBroken?: (error: Error) => void
) {
  const protocol =
    env.PUBLIC_API_PROTOCOL ||
    (process.env.NODE_ENV === "development" ? "ws" : "wss");
  const host = env.PUBLIC_API_HOST;

  let url = `${protocol}://${host}/v1/verify/session/${sessionId}`;

  if (process.env.NODE_ENV === "development") {
    url = `${protocol}://${window.location.hostname}:8787/v1/verify/session/${sessionId}`;
  }

  const stub = newWebSocketRpcSession<VerifySession>(url);

  if (onBroken) {
    stub.onRpcBroken(onBroken);
  }

  return stub;
}
