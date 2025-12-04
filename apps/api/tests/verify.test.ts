import { describe, expect, test } from "bun:test";
import { newWebSocketRpcSession } from "capnweb";
import type { VerifySession } from "@/shared/verify";

/**
 * Test whether we can connect to a verify session
 */
describe("Verification Flows", () => {
  test("Can connect to a verification session", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      "ws://localhost:8787/verify/connect"
    );

    expect(await stub.ping()).toBe("pong");
  });

  test("Can authenticate a verification session", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      "ws://localhost:8787/verify/connect"
    );

    // TODO: Actually authenticate the session
    const authenticated = stub.authenticate("vs_live_1234567890");

    expect(await authenticated.hello("Cap'n Web")).toBe(
      "Hello, Cap'n Web! (vs_live_1234567890)"
    );
  });
});
