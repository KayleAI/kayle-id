import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@kayle-id/database/drizzle";
import {
  events,
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";
import { generateId } from "@/utils/generate-id";
import v1 from "@/v1";
import { setup, TEST_DATA, teardown } from "./setup";

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  await teardown();
});

describe("/v1/sessions cancel terminal states", () => {
  test.serial(
    "Repeated cancel on an already-cancelled session is stable",
    async () => {
      const createResponse = await v1.request("/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
      });
      expect(createResponse.status).toBe(200);

      const created = (await createResponse.json()) as { data: { id: string } };

      const firstCancel = await v1.request(
        `/sessions/${created.data.id}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          },
        }
      );
      expect(firstCancel.status).toBe(204);

      const firstGet = await v1.request(`/sessions/${created.data.id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
      });
      const firstPayload = (await firstGet.json()) as {
        data: { status: string; completed_at: string | null };
      };
      expect(firstPayload.data.status).toBe("cancelled");
      expect(firstPayload.data.completed_at).not.toBeNull();

      const secondCancel = await v1.request(
        `/sessions/${created.data.id}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          },
        }
      );
      expect(secondCancel.status).toBe(204);

      const secondGet = await v1.request(`/sessions/${created.data.id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
      });
      const secondPayload = (await secondGet.json()) as {
        data: { status: string; completed_at: string | null };
      };

      expect(secondPayload.data.status).toBe("cancelled");
      expect(secondPayload.data.completed_at).toBe(
        firstPayload.data.completed_at
      );
    }
  );

  test.serial(
    "Cancel marks in-progress attempts with canonical failure_code",
    async () => {
      if (!TEST_DATA) {
        throw new Error("Test data not initialized");
      }

      const createResponse = await v1.request("/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA.apiKey}`,
        },
      });
      expect(createResponse.status).toBe(200);

      const created = (await createResponse.json()) as { data: { id: string } };
      const attemptId = generateId({ type: "va", environment: "test" });

      await db.insert(verification_attempts).values({
        id: attemptId,
        verificationSessionId: created.data.id,
        status: "in_progress",
      });

      const cancelResponse = await v1.request(
        `/sessions/${created.data.id}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_DATA.apiKey}`,
          },
        }
      );
      expect(cancelResponse.status).toBe(204);

      const [attemptAfter] = await db
        .select()
        .from(verification_attempts)
        .where(eq(verification_attempts.id, attemptId))
        .limit(1);

      expect(attemptAfter?.status).toBe("failed");
      expect(attemptAfter?.failureCode).toBe("session_cancelled");
      expect(attemptAfter?.completedAt).not.toBeNull();
    }
  );

  for (const status of ["completed", "expired", "cancelled"] as const) {
    test.serial(`Cancel does not mutate ${status} sessions`, async () => {
      if (!TEST_DATA) {
        throw new Error("Test data not initialized");
      }

      const sessionId = generateId({ type: "vs", environment: "test" });
      const attemptId = generateId({ type: "va", environment: "test" });
      const completedAt = new Date("2026-01-01T00:00:00.000Z");

      await db.insert(verification_sessions).values({
        id: sessionId,
        organizationId: TEST_DATA.organizationId,
        environment: "test",
        status,
        contractVersion: 1,
        shareFields: {},
        completedAt,
        expiresAt:
          status === "expired"
            ? new Date("2025-01-01T00:00:00.000Z")
            : new Date("2026-12-31T00:00:00.000Z"),
      });

      await db.insert(verification_attempts).values({
        id: attemptId,
        verificationSessionId: sessionId,
        status: "in_progress",
      });

      const cancelResponse = await v1.request(`/sessions/${sessionId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA.apiKey}`,
        },
      });
      expect(cancelResponse.status).toBe(204);

      const [sessionAfter] = await db
        .select()
        .from(verification_sessions)
        .where(eq(verification_sessions.id, sessionId))
        .limit(1);
      expect(sessionAfter?.status).toBe(status);
      expect(sessionAfter?.completedAt?.toISOString()).toBe(
        completedAt.toISOString()
      );

      const [attemptAfter] = await db
        .select()
        .from(verification_attempts)
        .where(eq(verification_attempts.id, attemptId))
        .limit(1);
      expect(attemptAfter?.status).toBe("in_progress");
      expect(attemptAfter?.failureCode).toBeNull();

      const cancelledEvents = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.organizationId, TEST_DATA.organizationId),
            eq(events.triggerId, sessionId),
            eq(events.type, "verification.session.cancelled")
          )
        );
      expect(cancelledEvents.length).toBe(0);
    });
  }
});
