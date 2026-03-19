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
import { setup, type TestData, teardown } from "./setup";

let TEST_DATA: TestData | undefined;

beforeAll(async () => {
  TEST_DATA = await setup();
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
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

type VerifySessionStatusResponse = {
  data: {
    completed_at: string | null;
    is_terminal: boolean;
    latest_attempt: {
      completed_at: string | null;
      failure_code: string | null;
      id: string;
      status: "cancelled" | "failed" | "in_progress" | "succeeded";
    } | null;
    redirect_url: string | null;
    session_id: string;
    status: "cancelled" | "completed" | "created" | "expired" | "in_progress";
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
};

async function createSession({
  redirectUrl,
}: {
  redirectUrl?: string;
} = {}): Promise<string> {
  const response = await v1.request("/sessions", {
    body: redirectUrl
      ? JSON.stringify({
          redirect_url: redirectUrl,
        })
      : undefined,
    headers: {
      Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      ...(redirectUrl ? { "Content-Type": "application/json" } : {}),
    },
    method: "POST",
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

describe("/v1/verify/session/:id/status", () => {
  test.serial("Returns 400 for invalid session ID", async () => {
    const response = await app.request(
      "/v1/verify/session/not-a-session/status",
      {
        method: "GET",
      }
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as VerifySessionStatusResponse;
    expect(payload.error?.code).toBe("INVALID_SESSION_ID");
  });

  test.serial("Returns 404 for unknown session", async () => {
    const response = await app.request(
      "/v1/verify/session/vs_test_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/status",
      {
        method: "GET",
      }
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as VerifySessionStatusResponse;
    expect(payload.error?.code).toBe("SESSION_NOT_FOUND");
  });

  test.serial(
    "Returns the terminal session payload with redirect URL and latest attempt",
    async () => {
      const completedAt = new Date("2099-01-01T00:00:00.000Z");
      const sessionId = await createSession({
        redirectUrl: "https://example.com/return",
      });

      await db
        .update(verification_sessions)
        .set({
          status: "completed",
          completedAt,
        })
        .where(eq(verification_sessions.id, sessionId));

      await db.insert(verification_attempts).values({
        id: "va_test_status_completed",
        verificationSessionId: sessionId,
        status: "succeeded",
        completedAt,
      });

      const response = await app.request(
        `/v1/verify/session/${sessionId}/status`,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as VerifySessionStatusResponse;

      expect(payload.error).toBeNull();
      expect(payload.data).toEqual({
        completed_at: completedAt.toISOString(),
        is_terminal: true,
        latest_attempt: {
          completed_at: completedAt.toISOString(),
          failure_code: null,
          id: "va_test_status_completed",
          status: "succeeded",
        },
        redirect_url: "https://example.com/return",
        session_id: sessionId,
        status: "completed",
      });
    }
  );

  test.serial(
    "Lazily normalizes expired sessions and updates the latest in-progress attempt",
    async () => {
      const expiredAt = new Date(Date.now() - 60_000);
      const sessionId = await createSession();

      await db
        .update(verification_sessions)
        .set({
          expiresAt: expiredAt,
        })
        .where(eq(verification_sessions.id, sessionId));

      await db.insert(verification_attempts).values({
        id: "va_test_status_expired",
        verificationSessionId: sessionId,
        status: "in_progress",
      });

      const response = await app.request(
        `/v1/verify/session/${sessionId}/status`,
        {
          method: "GET",
        }
      );

      expect(response.status).toBe(200);
      const payload = (await response.json()) as VerifySessionStatusResponse;

      expect(payload.error).toBeNull();
      expect(payload.data?.session_id).toBe(sessionId);
      expect(payload.data?.status).toBe("expired");
      expect(payload.data?.is_terminal).toBeTrue();
      expect(payload.data?.latest_attempt?.id).toBe("va_test_status_expired");
      expect(payload.data?.latest_attempt?.status).toBe("failed");
      expect(payload.data?.latest_attempt?.failure_code).toBe(
        "session_expired"
      );

      const [session] = await db
        .select({
          completedAt: verification_sessions.completedAt,
          status: verification_sessions.status,
        })
        .from(verification_sessions)
        .where(eq(verification_sessions.id, sessionId))
        .limit(1);

      const [attempt] = await db
        .select({
          completedAt: verification_attempts.completedAt,
          failureCode: verification_attempts.failureCode,
          status: verification_attempts.status,
        })
        .from(verification_attempts)
        .where(eq(verification_attempts.id, "va_test_status_expired"))
        .limit(1);

      expect(session?.status).toBe("expired");
      expect(session?.completedAt).not.toBeNull();
      expect(attempt?.status).toBe("failed");
      expect(attempt?.failureCode).toBe("session_expired");
      expect(attempt?.completedAt).not.toBeNull();
    }
  );
});
