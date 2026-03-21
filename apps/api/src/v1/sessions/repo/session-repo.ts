import { db } from "@kayle-id/database/drizzle";
import {
  events,
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { and, eq, gt, gte, inArray, lte } from "drizzle-orm";
import { generateId } from "@/utils/generate-id";
import type { ShareFields } from "@/v1/sessions/domain/share-contract/types";

export function listVerificationSessions({
  organizationId,
  environment,
  status,
  createdFrom,
  createdTo,
  startingAfter,
  limit,
}: {
  organizationId: string;
  environment: "live" | "test" | "either";
  status?: "created" | "in_progress" | "completed" | "expired" | "cancelled";
  createdFrom?: string;
  createdTo?: string;
  startingAfter?: string;
  limit: number;
}) {
  const where = and(
    eq(verification_sessions.organizationId, organizationId),
    ...(environment !== "either"
      ? [eq(verification_sessions.environment, environment)]
      : []),
    ...(status ? [eq(verification_sessions.status, status)] : []),
    ...(createdFrom
      ? [gte(verification_sessions.createdAt, new Date(createdFrom))]
      : []),
    ...(createdTo
      ? [lte(verification_sessions.createdAt, new Date(createdTo))]
      : []),
    ...(startingAfter ? [gt(verification_sessions.id, startingAfter)] : [])
  );

  return db
    .select()
    .from(verification_sessions)
    .where(where)
    .orderBy(verification_sessions.id)
    .limit(limit + 1);
}

export async function getVerificationSessionById({
  environment,
  id,
  organizationId,
}: {
  environment: "live" | "test";
  id: string;
  organizationId: string;
}) {
  const [row] = await db
    .select()
    .from(verification_sessions)
    .where(
      and(
        eq(verification_sessions.id, id),
        eq(verification_sessions.organizationId, organizationId),
        eq(verification_sessions.environment, environment)
      )
    )
    .limit(1);

  return row;
}

export function getAttemptsBySessionId(sessionId: string) {
  return db
    .select()
    .from(verification_attempts)
    .where(eq(verification_attempts.verificationSessionId, sessionId));
}

export function getAttemptsBySessionIds(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(verification_attempts)
    .where(inArray(verification_attempts.verificationSessionId, sessionIds));
}

export function createVerificationSession({
  id,
  organizationId,
  environment,
  redirectUrl,
  shareFields,
  contractVersion,
}: {
  id: string;
  organizationId: string;
  environment: "live" | "test";
  redirectUrl: string | null;
  shareFields: ShareFields;
  contractVersion: number;
}) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(verification_sessions)
      .values({
        id,
        organizationId,
        environment,
        status: "created",
        redirectUrl,
        shareFields,
        contractVersion,
      })
      .returning();

    return created;
  });
}

export async function cancelVerificationSession({
  row,
  organizationId,
}: {
  row: typeof verification_sessions.$inferSelect;
  organizationId: string;
}) {
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(verification_sessions)
      .set({
        status: "cancelled",
        completedAt: now,
      })
      .where(eq(verification_sessions.id, row.id));

    await tx
      .update(verification_attempts)
      .set({
        status: "failed",
        failureCode: "session_cancelled",
        completedAt: now,
      })
      .where(
        and(
          eq(verification_attempts.verificationSessionId, row.id),
          eq(verification_attempts.status, "in_progress")
        )
      );

    await tx.insert(events).values({
      id: generateId({ type: "evt", environment: row.environment }),
      organizationId,
      environment: row.environment,
      type: "verification.session.cancelled",
      triggerId: row.id,
      triggerType: "verification_session",
    });
  });
}

export async function expireVerificationSessionIfNeeded({
  now = new Date(),
  row,
}: {
  now?: Date;
  row: typeof verification_sessions.$inferSelect;
}) {
  if (
    row.status === "expired" ||
    row.status === "completed" ||
    row.status === "cancelled" ||
    row.expiresAt.getTime() > now.getTime()
  ) {
    return row;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(verification_sessions)
      .set({
        status: "expired",
        completedAt: row.completedAt ?? now,
      })
      .where(eq(verification_sessions.id, row.id));

    await tx
      .update(verification_attempts)
      .set({
        status: "failed",
        failureCode: "session_expired",
        completedAt: now,
      })
      .where(
        and(
          eq(verification_attempts.verificationSessionId, row.id),
          eq(verification_attempts.status, "in_progress")
        )
      );

    await tx.insert(events).values({
      id: generateId({ type: "evt", environment: row.environment }),
      organizationId: row.organizationId,
      environment: row.environment,
      type: "verification.session.expired",
      triggerId: row.id,
      triggerType: "verification_session",
    });
  });

  return {
    ...row,
    status: "expired" as const,
    completedAt: row.completedAt ?? now,
  };
}
