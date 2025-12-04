import { beforeAll, describe, expect, test } from "bun:test";
import { newWebSocketRpcSession } from "capnweb";
import type { VerifySession } from "@/shared/verify";

beforeAll(
  async () => {
    // wait for the API to be ready
    for (let i = 0; i < 10; i++) {
      const response = await fetch("http://localhost:8787/");
      if (response.ok) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("Local API not ready after 10 seconds");
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
  }, 1000);

  test("Can authenticate a verification session", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      "ws://localhost:8787/verify/connect"
    );

    // TODO: Actually authenticate the session
    const authenticated = stub.authenticate("vs_live_1234567890");

    expect(await authenticated.hello("Cap'n Web")).toBe(
      "Hello, Cap'n Web! (vs_live_1234567890)"
    );
  }, 1000);
});
