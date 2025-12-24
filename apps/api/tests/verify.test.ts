import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { newWebSocketRpcSession } from "capnweb";
import type z from "zod";
import type { Session } from "@/openapi/models/sessions";
import type { VerifySession } from "@/shared/verify";
import v1 from "@/v1";
import { setup, TEST_DATA, teardown } from "./setup";

let createdSessionId: string | undefined;

beforeAll(async () => {
  await setup();

  const response = await v1.request("/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_DATA?.apiKey}`,
    },
  });

  const { data } = (await response.json()) as {
    data: z.infer<typeof Session>;
  };

  if (!data?.id) {
    throw new Error("Failed to create session");
  }

  createdSessionId = data.id;
});

afterAll(async () => {
  await teardown();

  if (createdSessionId) {
    await v1.request(`/sessions/${createdSessionId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });
  }
});

/**
 * Test whether we can connect to a verify session
 */
describe("Verification Flows", () => {
  test("Can connect to a verification session", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      `ws://127.0.0.1:8787/v1/verify/session/${createdSessionId}`
    );

    expect(await stub.ping()).toBe("pong");
  }, 5000);

  test("Can get the session ID", async () => {
    using stub = newWebSocketRpcSession<VerifySession>(
      `ws://127.0.0.1:8787/v1/verify/session/${createdSessionId}`
    );

    expect((await stub.getSession()).id).toBe(createdSessionId as string);
  }, 5000);
});
