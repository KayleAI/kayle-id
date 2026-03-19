import { db } from "@kayle-id/database/drizzle";
import {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { desc, eq } from "drizzle-orm";
import { expireVerificationSessionIfNeeded } from "@/v1/sessions/repo/session-repo";
import { isTerminalAttemptStatus, isTerminalSessionStatus } from "./status";

export type PublicVerifyAttemptStatus = {
  completed_at: string | null;
  failure_code: string | null;
  id: string;
  status: "cancelled" | "failed" | "in_progress" | "succeeded";
};

export type PublicVerifySessionStatus = {
  completed_at: string | null;
  is_terminal: boolean;
  latest_attempt: PublicVerifyAttemptStatus | null;
  redirect_url: string | null;
  session_id: string;
  status: "cancelled" | "completed" | "created" | "expired" | "in_progress";
};

export async function getPublicVerifySessionStatus({
  now = new Date(),
  sessionId,
}: {
  now?: Date;
  sessionId: string;
}): Promise<PublicVerifySessionStatus | null> {
  const [rawSession] = await db
    .select()
    .from(verification_sessions)
    .where(eq(verification_sessions.id, sessionId))
    .limit(1);

  if (!rawSession) {
    return null;
  }

  const session = await expireVerificationSessionIfNeeded({
    now,
    row: rawSession,
  });

  const [attempt] = await db
    .select({
      completedAt: verification_attempts.completedAt,
      failureCode: verification_attempts.failureCode,
      id: verification_attempts.id,
      status: verification_attempts.status,
    })
    .from(verification_attempts)
    .where(eq(verification_attempts.verificationSessionId, session.id))
    .orderBy(desc(verification_attempts.createdAt))
    .limit(1);

  const latestAttempt =
    attempt &&
    (attempt.status === "in_progress" ||
      isTerminalAttemptStatus(attempt.status))
      ? {
          completed_at: attempt.completedAt?.toISOString() ?? null,
          failure_code: attempt.failureCode ?? null,
          id: attempt.id,
          status: attempt.status,
        }
      : null;

  return {
    completed_at: session.completedAt?.toISOString() ?? null,
    is_terminal: isTerminalSessionStatus(session.status),
    latest_attempt: latestAttempt,
    redirect_url: session.redirectUrl ?? null,
    session_id: session.id,
    status: session.status,
  };
}
