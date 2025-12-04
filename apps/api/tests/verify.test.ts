import { beforeAll, describe, expect, test } from "bun:test";
import { newWebSocketRpcSession } from "capnweb";
import type { VerifySession } from "@/shared/verify";

async function fetchWithTimeout(
  url: string,
  ms: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    // abort / network error -> treat as "not ready"
    return null;
  } finally {
    clearTimeout(timer);
  }
}

beforeAll(
  async () => {
    // Wait for the API to be ready before running verification tests
    let ready = false;

    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetchWithTimeout("http://localhost:8787/", 1000);
        if (response?.ok) {
          ready = true;
          break;
        }
      } catch {
        // Ignore connection errors while the server is still starting
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!ready) {
      throw new Error("Local API not ready after 30 seconds");
    }
  },
  {
    timeout: 60_000,
  }
);

/**
 * Test whether we can connect to a verify session
 */
describe("Verification Flows", () => {
  test("Can connect to a verification session", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      "ws://localhost:8787/verify/connect"
    );

    expect(await stub.ping()).toBe("pong");
  }, 5000);

  test("Can authenticate a verification session", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      "ws://localhost:8787/verify/connect"
    );

    // TODO: Actually authenticate the session
    const authenticated = stub.authenticate("vs_live_1234567890");

    expect(await authenticated.hello("Cap'n Web")).toBe(
      "Hello, Cap'n Web! (vs_live_1234567890)"
    );
  }, 5000);
});
