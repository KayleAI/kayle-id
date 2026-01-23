import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type z from "zod";
import type { Session } from "@/openapi/models/sessions";
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
 * Helper to create a WebSocket connection and send/receive messages
 */
function connectWebSocket(url: string): Promise<{
  send: (msg: object) => void;
  receive: () => Promise<object>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messageQueue: object[] = [];
    let messageResolve: ((msg: object) => void) | null = null;

    ws.onopen = () => {
      resolve({
        send: (msg) => ws.send(JSON.stringify(msg)),
        receive: () =>
          new Promise((res) => {
            if (messageQueue.length > 0) {
              res(messageQueue.shift() ?? {});
            } else {
              messageResolve = res;
            }
          }),
        close: () => ws.close(),
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (messageResolve) {
          messageResolve(data);
          messageResolve = null;
        } else {
          messageQueue.push(data);
        }
      } catch {
        // Ignore non-JSON messages (like pong)
      }
    };

    ws.onerror = (error) => {
      reject(error);
    };

    ws.onclose = (event) => {
      if (!event.wasClean && messageResolve) {
        reject(new Error(`WebSocket closed: ${event.code} ${event.reason}`));
      }
    };
  });
}

/**
 * Test whether we can connect to a verify session
 */
describe("Verification Flows", () => {
  test("Can connect to a verification session and ping", async () => {
    const conn = await connectWebSocket(
      `ws://127.0.0.1:8787/v1/verify/session/${createdSessionId}/ws`
    );

    try {
      conn.send({ type: "ping" });
      const response = await conn.receive();
      expect(response).toEqual({ type: "pong" });
    } finally {
      conn.close();
    }
  }, 5000);

  test("Can get the session data", async () => {
    const conn = await connectWebSocket(
      `ws://127.0.0.1:8787/v1/verify/session/${createdSessionId}/ws`
    );

    try {
      conn.send({ type: "get_session" });
      const response = (await conn.receive()) as {
        type: string;
        data?: { id: string };
      };
      expect(response.type).toBe("session");
      expect(response.data?.id).toBe(createdSessionId);
    } finally {
      conn.close();
    }
  }, 5000);
});
