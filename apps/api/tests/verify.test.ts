import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ClientMessage, ServerMessage } from "@kayle-id/capnp";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { Message } from "capnp-es";
import { eq } from "drizzle-orm";
import type z from "zod";
import { createHMAC } from "@/functions/hmac";
import app from "@/index";
import type { Session } from "@/openapi/models/sessions";
import v1 from "@/v1";
import { setup, TEST_DATA, teardown } from "./setup";

type HandoffPayload = {
  v: number;
  session_id: string;
  attempt_id: string;
  mobile_write_token: string;
  expires_at: string;
};

type HandoffResponse = {
  data: HandoffPayload | null;
  error: {
    code: string;
    message: string;
  } | null;
};

type ServerAckOrError = {
  ack?: string;
  error?: {
    code: string;
    message: string;
  };
};

const createdSessionIds: string[] = [];

function encodeHelloMessage({
  attemptId,
  mobileWriteToken,
  deviceId,
  appVersion,
}: {
  attemptId: string;
  mobileWriteToken: string;
  deviceId: string;
  appVersion: string;
}): Uint8Array {
  const message = new Message();
  const root = message.initRoot(ClientMessage);
  const hello = root._initHello();
  hello.attemptId = attemptId;
  hello.mobileWriteToken = mobileWriteToken;
  hello.deviceId = deviceId;
  hello.appVersion = appVersion;
  return new Uint8Array(message.toArrayBuffer());
}

function encodePhaseMessage(phase: string): Uint8Array {
  const message = new Message();
  const root = message.initRoot(ClientMessage);
  const phaseUpdate = root._initPhase();
  phaseUpdate.phase = phase;
  phaseUpdate.error = "";
  return new Uint8Array(message.toArrayBuffer());
}

async function getEventBytes(data: unknown): Promise<Uint8Array | null> {
  if (typeof data === "string") {
    return null;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }

  return null;
}

function decodeServerMessage(bytes: Uint8Array): ServerAckOrError | null {
  try {
    const message = new Message(bytes, false);
    const root = message.getRoot(ServerMessage);

    switch (root.which()) {
      case ServerMessage.ACK:
        return {
          ack: root.ack.message,
        };

      case ServerMessage.ERROR:
        return {
          error: {
            code: root.error.code,
            message: root.error.message,
          },
        };

      default:
        return null;
    }
  } catch {
    return null;
  }
}

function awaitSocketOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error("WebSocket connection failed."));
    };

    const handleClose = () => {
      cleanup();
      reject(new Error("WebSocket closed before opening."));
    };

    const cleanup = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);
  });
}

function awaitServerMessage(socket: WebSocket): Promise<ServerAckOrError> {
  return new Promise((resolve, reject) => {
    const timeoutMs = 3000;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for server message."));
    }, timeoutMs);

    const handleMessage = async (event: MessageEvent) => {
      const bytes = await getEventBytes(event.data);
      if (!bytes) {
        cleanup();
        reject(new Error("Expected a binary server message."));
        return;
      }

      const decoded = decodeServerMessage(bytes);
      if (!decoded) {
        cleanup();
        reject(new Error("Failed to decode server protobuf message."));
        return;
      }

      cleanup();
      resolve(decoded);
    };

    const handleError = () => {
      cleanup();
      reject(new Error("WebSocket connection failed."));
    };

    const handleClose = () => {
      cleanup();
      reject(new Error("WebSocket closed before receiving a server message."));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
    };

    socket.addEventListener("message", handleMessage);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleClose);
  });
}

function openVerifySocket(sessionId: string): WebSocket {
  const socket = new WebSocket(
    `ws://127.0.0.1:8787/v1/verify/session/${sessionId}`
  );
  socket.binaryType = "arraybuffer";
  return socket;
}

async function createSession(): Promise<string> {
  const response = await v1.request("/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_DATA?.apiKey}`,
    },
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200 from /sessions, received ${response.status}`);
  }

  const { data } = (await response.json()) as {
    data: z.infer<typeof Session>;
  };

  if (!data?.id) {
    throw new Error("Failed to create session");
  }

  createdSessionIds.push(data.id);

  return data.id;
}

async function createHandoff(sessionId: string): Promise<HandoffPayload> {
  const response = await app.request(
    `/v1/verify/session/${sessionId}/handoff`,
    {
      method: "POST",
    }
  );

  if (response.status !== 200) {
    throw new Error(
      `Expected 200 from /v1/verify/session/:id/handoff, received ${response.status}`
    );
  }

  const payload = (await response.json()) as HandoffResponse;

  if (!payload.data) {
    throw new Error("Expected handoff response data");
  }

  return payload.data;
}

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  for (const sessionId of createdSessionIds) {
    await v1.request(`/sessions/${sessionId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });
  }

  await teardown();
});

describe("Verification Flows", () => {
  test.serial(
    "Accepts authenticated hello and persists consume + session ownership",
    async () => {
      const sessionId = await createSession();
      const handoff = await createHandoff(sessionId);

      const socket = openVerifySocket(sessionId);

      try {
        await awaitSocketOpen(socket);
        socket.send(
          encodeHelloMessage({
            attemptId: handoff.attempt_id,
            mobileWriteToken: handoff.mobile_write_token,
            deviceId: "ios-device-a",
            appVersion: "1.0.0",
          })
        );

        const response = await awaitServerMessage(socket);
        expect(response.ack).toBe("hello_ok");
      } finally {
        socket.close();
      }

      const [session] = await db
        .select({
          status: verification_sessions.status,
        })
        .from(verification_sessions)
        .where(eq(verification_sessions.id, sessionId))
        .limit(1);

      const [attempt] = await db
        .select({
          mobileWriteTokenConsumedAt:
            verification_attempts.mobileWriteTokenConsumedAt,
          mobileHelloDeviceIdHash:
            verification_attempts.mobileHelloDeviceIdHash,
          mobileHelloAppVersion: verification_attempts.mobileHelloAppVersion,
        })
        .from(verification_attempts)
        .where(eq(verification_attempts.id, handoff.attempt_id))
        .limit(1);

      expect(session?.status).toBe("in_progress");
      expect(attempt?.mobileWriteTokenConsumedAt).not.toBeNull();
      const expectedDeviceHash = await createHMAC("ios-device-a", {
        secret: env.AUTH_SECRET,
      });
      expect(attempt?.mobileHelloDeviceIdHash).toBe(expectedDeviceHash);
      expect(attempt?.mobileHelloAppVersion).toBe("1.0.0");
    }
  );

  test.serial("Rejects hello missing required credentials", async () => {
    const sessionId = await createSession();
    await createHandoff(sessionId);

    const socket = openVerifySocket(sessionId);

    try {
      await awaitSocketOpen(socket);
      socket.send(
        encodeHelloMessage({
          attemptId: "",
          mobileWriteToken: "",
          deviceId: "ios-device-a",
          appVersion: "1.0.0",
        })
      );

      const response = await awaitServerMessage(socket);
      expect(response.error?.code).toBe("HELLO_AUTH_REQUIRED");
    } finally {
      socket.close();
    }
  });

  test.serial(
    "Returns ATTEMPT_NOT_FOUND for unknown attempt in hello",
    async () => {
      const sessionId = await createSession();
      const handoff = await createHandoff(sessionId);

      const socket = openVerifySocket(sessionId);

      try {
        await awaitSocketOpen(socket);
        socket.send(
          encodeHelloMessage({
            attemptId: "va_test_unknown_attempt_id",
            mobileWriteToken: handoff.mobile_write_token,
            deviceId: "ios-device-a",
            appVersion: "1.0.0",
          })
        );

        const response = await awaitServerMessage(socket);
        expect(response.error?.code).toBe("ATTEMPT_NOT_FOUND");
      } finally {
        socket.close();
      }
    }
  );

  test.serial("Rejects hello with invalid token hash", async () => {
    const sessionId = await createSession();
    const handoff = await createHandoff(sessionId);

    const socket = openVerifySocket(sessionId);

    try {
      await awaitSocketOpen(socket);
      socket.send(
        encodeHelloMessage({
          attemptId: handoff.attempt_id,
          mobileWriteToken: "invalid-token",
          deviceId: "ios-device-a",
          appVersion: "1.0.0",
        })
      );

      const response = await awaitServerMessage(socket);
      expect(response.error?.code).toBe("HANDOFF_TOKEN_INVALID");
    } finally {
      socket.close();
    }
  });

  test.serial(
    "Rejects hello when token is expired and unconsumed",
    async () => {
      const sessionId = await createSession();
      const handoff = await createHandoff(sessionId);

      await db
        .update(verification_attempts)
        .set({
          mobileWriteTokenExpiresAt: new Date(Date.now() - 1000),
          mobileWriteTokenConsumedAt: null,
        })
        .where(eq(verification_attempts.id, handoff.attempt_id));

      const socket = openVerifySocket(sessionId);

      try {
        await awaitSocketOpen(socket);
        socket.send(
          encodeHelloMessage({
            attemptId: handoff.attempt_id,
            mobileWriteToken: handoff.mobile_write_token,
            deviceId: "ios-device-a",
            appVersion: "1.0.0",
          })
        );

        const response = await awaitServerMessage(socket);
        expect(response.error?.code).toBe("HANDOFF_TOKEN_EXPIRED");
      } finally {
        socket.close();
      }
    }
  );

  test.serial("Allows consumed-token resume from the same device", async () => {
    const sessionId = await createSession();
    const handoff = await createHandoff(sessionId);
    const helloMessage = encodeHelloMessage({
      attemptId: handoff.attempt_id,
      mobileWriteToken: handoff.mobile_write_token,
      deviceId: "ios-device-a",
      appVersion: "1.0.0",
    });

    const socketOne = openVerifySocket(sessionId);

    try {
      await awaitSocketOpen(socketOne);
      socketOne.send(helloMessage);
      const firstResponse = await awaitServerMessage(socketOne);
      expect(firstResponse.ack).toBe("hello_ok");
    } finally {
      socketOne.close();
    }

    const socketTwo = openVerifySocket(sessionId);

    try {
      await awaitSocketOpen(socketTwo);
      socketTwo.send(helloMessage);
      const secondResponse = await awaitServerMessage(socketTwo);
      expect(secondResponse.ack).toBe("hello_ok");
    } finally {
      socketTwo.close();
    }
  });

  test.serial(
    "Rejects consumed-token resume from a different device",
    async () => {
      const sessionId = await createSession();
      const handoff = await createHandoff(sessionId);

      const socketOne = openVerifySocket(sessionId);

      try {
        await awaitSocketOpen(socketOne);
        socketOne.send(
          encodeHelloMessage({
            attemptId: handoff.attempt_id,
            mobileWriteToken: handoff.mobile_write_token,
            deviceId: "ios-device-a",
            appVersion: "1.0.0",
          })
        );
        const firstResponse = await awaitServerMessage(socketOne);
        expect(firstResponse.ack).toBe("hello_ok");
      } finally {
        socketOne.close();
      }

      const socketTwo = openVerifySocket(sessionId);

      try {
        await awaitSocketOpen(socketTwo);
        socketTwo.send(
          encodeHelloMessage({
            attemptId: handoff.attempt_id,
            mobileWriteToken: handoff.mobile_write_token,
            deviceId: "ios-device-b",
            appVersion: "1.0.0",
          })
        );

        const secondResponse = await awaitServerMessage(socketTwo);
        expect(secondResponse.error?.code).toBe("HANDOFF_DEVICE_MISMATCH");
      } finally {
        socketTwo.close();
      }
    }
  );

  test.serial(
    "Handoff endpoint blocks new handoff issuance after authenticated hello",
    async () => {
      const sessionId = await createSession();
      const handoff = await createHandoff(sessionId);

      const socket = openVerifySocket(sessionId);

      try {
        await awaitSocketOpen(socket);
        socket.send(
          encodeHelloMessage({
            attemptId: handoff.attempt_id,
            mobileWriteToken: handoff.mobile_write_token,
            deviceId: "ios-device-a",
            appVersion: "1.0.0",
          })
        );
        const response = await awaitServerMessage(socket);
        expect(response.ack).toBe("hello_ok");
      } finally {
        socket.close();
      }

      const secondHandoffResponse = await app.request(
        `/v1/verify/session/${sessionId}/handoff`,
        {
          method: "POST",
        }
      );

      expect(secondHandoffResponse.status).toBe(409);
      const payload = (await secondHandoffResponse.json()) as HandoffResponse;
      expect(payload.error?.code).toBe("SESSION_IN_PROGRESS");
    }
  );

  test.serial(
    "Rejects non-hello messages before hello with HELLO_REQUIRED",
    async () => {
      const sessionId = await createSession();
      await createHandoff(sessionId);

      const socket = openVerifySocket(sessionId);

      try {
        await awaitSocketOpen(socket);
        socket.send(encodePhaseMessage("mobile_connected"));

        const response = await awaitServerMessage(socket);
        expect(response.error?.code).toBe("HELLO_REQUIRED");
      } finally {
        socket.close();
      }
    },
    5000
  );
});
