import { beforeAll, describe, expect, test } from "bun:test";
import { file } from "bun";
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
    try {
      // Wait for the API to be ready before running verification tests.
      // We cap total wait below the hook timeout to avoid timing out the hook itself.
      const maxWaitMs = 25_000;
      const start = Date.now();

      while (true) {
        const elapsed = Date.now() - start;
        if (elapsed >= maxWaitMs) {
          break;
        }

        const remaining = maxWaitMs - elapsed;
        const probeTimeout = remaining > 1000 ? 1000 : remaining;

        const response = await fetchWithTimeout(
          "http://localhost:8787/",
          probeTimeout
        );

        if (response?.ok) {
          return;
        }

        // Short sleep between probes
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      throw new Error("Local API not ready after 25 seconds");
    } catch (error) {
      // If the API never became ready, dump Wrangler logs to help debugging CI
      try {
        const logFile = file("/tmp/api.log");
        if (await logFile.exists()) {
          const logs = await logFile.text();
          console.error("===== /tmp/api.log (Wrangler) =====");
          console.error(logs);
          console.error("===== end of /tmp/api.log =====");
        } else {
          console.error("No /tmp/api.log file found");
        }
      } catch (logError) {
        console.error("Failed to read /tmp/api.log", logError);
      }

      throw error;
    }
  },
  {
    timeout: 30_000,
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
