import { db } from "@kayle-id/database/drizzle";
import {
  events,
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";
import { generateId } from "@/utils/generate-id";
import { createWebhookDeliveriesForVerificationAttemptFailed } from "@/v1/webhooks/deliveries/service";

export const MAX_FAILED_ATTEMPTS = 3;

type SessionContext = {
  contractVersion: number;
  id: string;
  organizationId: string;
  environment: "live" | "test";
  status: string;
  completedAt: Date | null;
};

function normalizeRiskScore(score: number): number {
  if (Number.isNaN(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

export async function markAttemptFailed({
  session,
  attemptId,
  failureCode,
  riskScore,
}: {
  session: SessionContext;
  attemptId: string;
  failureCode: "passport_authenticity_failed" | "selfie_face_mismatch";
  riskScore: number;
}): Promise<{
  deliveryIds: string[];
  failedAttempts: number;
  terminalized: boolean;
}> {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const attemptFailedEventId = generateId({
      type: "evt",
      environment: session.environment,
    });

    await tx
      .update(verification_attempts)
      .set({
        status: "failed",
        failureCode,
        riskScore: normalizeRiskScore(riskScore),
        completedAt: now,
      })
      .where(eq(verification_attempts.id, attemptId));

    await tx.insert(events).values({
      id: attemptFailedEventId,
      organizationId: session.organizationId,
      environment: session.environment,
      type: "verification.attempt.failed",
      triggerId: attemptId,
      triggerType: "verification_attempt",
    });

    const failedAttempts = await tx
      .select({
        id: verification_attempts.id,
      })
      .from(verification_attempts)
      .where(
        and(
          eq(verification_attempts.verificationSessionId, session.id),
          eq(verification_attempts.status, "failed")
        )
      );

    const exhaustedRetryLimit = failedAttempts.length >= MAX_FAILED_ATTEMPTS;

    await tx
      .update(verification_sessions)
      .set({
        status: exhaustedRetryLimit ? "completed" : "created",
        completedAt: exhaustedRetryLimit ? now : null,
      })
      .where(eq(verification_sessions.id, session.id));

    if (exhaustedRetryLimit) {
      await tx.insert(events).values({
        id: generateId({ type: "evt", environment: session.environment }),
        organizationId: session.organizationId,
        environment: session.environment,
        type: "verification.session.completed",
        triggerId: session.id,
        triggerType: "verification_session",
      });
    }

    session.status = exhaustedRetryLimit ? "completed" : "created";
    session.completedAt = exhaustedRetryLimit ? now : null;

    return {
      attemptFailedEventId,
      failedAttempts: failedAttempts.length,
      terminalized: exhaustedRetryLimit,
    };
  });

  const deliveryIds = await createWebhookDeliveriesForVerificationAttemptFailed(
    {
      attemptId,
      contractVersion: session.contractVersion,
      environment: session.environment,
      eventId: result.attemptFailedEventId,
      failureCode,
      organizationId: session.organizationId,
      sessionId: session.id,
    }
  );

  return {
    deliveryIds,
    failedAttempts: result.failedAttempts,
    terminalized: result.terminalized,
  };
}

export async function markAttemptSucceeded({
  session,
  attemptId,
  ...scoreInput
}: {
  session: SessionContext;
  attemptId: string;
} & (
  | {
      faceScore: number;
      riskScore?: never;
    }
  | {
      faceScore?: never;
      riskScore: number;
    }
)): Promise<{
  attemptSucceededEventId: string;
  sessionCompletedEventId: string;
}> {
  const now = new Date();
  const riskScore =
    typeof scoreInput.riskScore === "number"
      ? normalizeRiskScore(scoreInput.riskScore)
      : normalizeRiskScore(1 - normalizeRiskScore(scoreInput.faceScore));

  const result = await db.transaction(async (tx) => {
    await tx
      .update(verification_attempts)
      .set({
        status: "succeeded",
        failureCode: null,
        riskScore,
        completedAt: now,
      })
      .where(eq(verification_attempts.id, attemptId));

    const attemptSucceededEventId = generateId({
      type: "evt",
      environment: session.environment,
    });

    await tx.insert(events).values({
      id: attemptSucceededEventId,
      organizationId: session.organizationId,
      environment: session.environment,
      type: "verification.attempt.succeeded",
      triggerId: attemptId,
      triggerType: "verification_attempt",
    });

    await tx
      .update(verification_sessions)
      .set({
        status: "completed",
        completedAt: now,
      })
      .where(eq(verification_sessions.id, session.id));

    const sessionCompletedEventId = generateId({
      type: "evt",
      environment: session.environment,
    });

    await tx.insert(events).values({
      id: sessionCompletedEventId,
      organizationId: session.organizationId,
      environment: session.environment,
      type: "verification.session.completed",
      triggerId: session.id,
      triggerType: "verification_session",
    });

    return {
      attemptSucceededEventId,
      sessionCompletedEventId,
    };
  });

  session.status = "completed";
  session.completedAt = now;

  return result;
}
