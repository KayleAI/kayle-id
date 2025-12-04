import { describe, expect, test } from "bun:test";
import { newWebSocketRpcSession } from "capnweb";
import type { VerifySession } from "@/shared/verify";

/**
 * Test whether we can connect to a verify session
 */
describe("Verification Flows", () => {
  test("Can connect to a verification session", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      "ws://127.0.0.1:8787/v1/verify/session/vs_live_1234567890"
    );

    expect(await stub.ping()).toBe("pong");
  }, 5000);

  test("Can get the session ID", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      "ws://127.0.0.1:8787/v1/verify/session/vs_live_1234567890"
    );

    expect(await stub.getSession()).toBe("vs_live_1234567890");
  }, 5000);
});
