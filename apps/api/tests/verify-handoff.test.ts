import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";
import { createHMAC } from "@/functions/hmac";
import app from "@/index";
import v1 from "@/v1";
import { setup, TEST_DATA, teardown } from "./setup";

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  await teardown();
});

type HandoffResponse = {
  data: {
    v: number;
    session_id: string;
    attempt_id: string;
    mobile_write_token: string;
    expires_at: string;
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
};

async function createSession(): Promise<string> {
  const response = await v1.request("/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_DATA?.apiKey}`,
    },
  });

  if (response.status !== 200) {
    throw new Error(
      `Expected session creation to return 200, received ${response.status}`
    );
  }

  const payload = (await response.json()) as { data: { id: string } };

  if (!payload.data?.id) {
    throw new Error("Session creation response is missing data.id");
  }

  return payload.data.id;
}

describe("/v1/verify/session/:id/handoff", () => {
  test.serial("Returns 400 for invalid session ID", async () => {
    const response = await app.request(
      "/v1/verify/session/not-a-session/handoff",
      {
        method: "POST",
      }
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as HandoffResponse;
    expect(payload.error?.code).toBe("INVALID_SESSION_ID");
  });

  test.serial("Returns 404 for unknown session", async () => {
    const unknownSessionId =
      "vs_test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

    const response = await app.request(
      `/v1/verify/session/${unknownSessionId}/handoff`,
      {
        method: "POST",
      }
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as HandoffResponse;
    expect(payload.error?.code).toBe("SESSION_NOT_FOUND");
  });

  test.serial("Returns 410 for cancelled sessions", async () => {
    const sessionId = await createSession();

    const cancelResponse = await v1.request(`/sessions/${sessionId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });
    expect(cancelResponse.status).toBe(204);

    const response = await app.request(
      `/v1/verify/session/${sessionId}/handoff`,
      {
        method: "POST",
      }
    );

    expect(response.status).toBe(410);
    const payload = (await response.json()) as HandoffResponse;
    expect(payload.error?.code).toBe("SESSION_EXPIRED");
  });

  test.serial("Returns 409 for in-progress sessions", async () => {
    const sessionId = await createSession();

    await db
      .update(verification_sessions)
      .set({ status: "in_progress" })
      .where(eq(verification_sessions.id, sessionId));

    const response = await app.request(
      `/v1/verify/session/${sessionId}/handoff`,
      {
        method: "POST",
      }
    );

    expect(response.status).toBe(409);
    const payload = (await response.json()) as HandoffResponse;
    expect(payload.error?.code).toBe("SESSION_IN_PROGRESS");
  });

  test.serial("Creates handoff payload and persists token hash", async () => {
    if (!TEST_DATA) {
      throw new Error("Test data not initialized");
    }

    const sessionId = await createSession();

    const response = await app.request(
      `/v1/verify/session/${sessionId}/handoff`,
      {
        method: "POST",
      }
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as HandoffResponse;

    expect(payload.error).toBeNull();
    expect(payload.data?.v).toBe(1);
    expect(payload.data?.session_id).toBe(sessionId);
    expect(payload.data?.attempt_id).toBeDefined();
    expect(payload.data?.mobile_write_token).toBeDefined();
    expect(payload.data?.expires_at).toBeDefined();

    const [attempt] = await db
      .select()
      .from(verification_attempts)
      .where(
        and(
          eq(verification_attempts.id, payload.data?.attempt_id ?? ""),
          eq(verification_attempts.verificationSessionId, sessionId)
        )
      )
      .limit(1);

    expect(attempt).toBeDefined();
    expect(attempt?.mobileWriteTokenSeed).toBeDefined();
    expect(attempt?.mobileWriteTokenSeed).not.toBe(
      payload.data?.mobile_write_token
    );
    expect(attempt?.mobileWriteTokenHash).toBeDefined();
    expect(attempt?.mobileWriteTokenHash).not.toBe(
      payload.data?.mobile_write_token
    );
    expect(attempt?.mobileWriteTokenIssuedAt).not.toBeNull();
    expect(attempt?.mobileWriteTokenExpiresAt).not.toBeNull();

    const expectedHash = await createHMAC(
      payload.data?.mobile_write_token ?? "",
      {
        secret: env.AUTH_SECRET,
      }
    );
    expect(attempt?.mobileWriteTokenHash).toBe(expectedHash);
  });

  test.serial(
    "Reuses attempt and expiry within the 60-second idempotency window",
    async () => {
      const sessionId = await createSession();

      const firstResponse = await app.request(
        `/v1/verify/session/${sessionId}/handoff`,
        {
          method: "POST",
        }
      );
      expect(firstResponse.status).toBe(200);
      const firstPayload = (await firstResponse.json()) as HandoffResponse;

      const secondResponse = await app.request(
        `/v1/verify/session/${sessionId}/handoff`,
        {
          method: "POST",
        }
      );
      expect(secondResponse.status).toBe(200);
      const secondPayload = (await secondResponse.json()) as HandoffResponse;

      expect(secondPayload.data?.attempt_id).toBe(
        firstPayload.data?.attempt_id
      );
      expect(secondPayload.data?.expires_at).toBe(
        firstPayload.data?.expires_at
      );
      expect(secondPayload.data?.mobile_write_token).toBe(
        firstPayload.data?.mobile_write_token
      );
    }
  );

  test.serial(
    "Issues a new attempt after the idempotency window elapses",
    async () => {
      const sessionId = await createSession();

      const firstResponse = await app.request(
        `/v1/verify/session/${sessionId}/handoff`,
        {
          method: "POST",
        }
      );
      expect(firstResponse.status).toBe(200);
      const firstPayload = (await firstResponse.json()) as HandoffResponse;
      const firstAttemptId = firstPayload.data?.attempt_id;

      await db
        .update(verification_attempts)
        .set({
          mobileWriteTokenIssuedAt: new Date(Date.now() - 61_000),
        })
        .where(eq(verification_attempts.id, firstAttemptId ?? ""));

      const secondResponse = await app.request(
        `/v1/verify/session/${sessionId}/handoff`,
        {
          method: "POST",
        }
      );
      expect(secondResponse.status).toBe(200);
      const secondPayload = (await secondResponse.json()) as HandoffResponse;

      expect(secondPayload.data?.attempt_id).not.toBe(firstAttemptId);
    }
  );
});
