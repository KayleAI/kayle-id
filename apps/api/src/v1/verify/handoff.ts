import { db } from "@kayle-id/database/drizzle";
import {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { desc, eq } from "drizzle-orm";
import { generateId } from "@/utils/generate-id";
import { expireVerificationSessionIfNeeded } from "@/v1/sessions/repo/session-repo";
import { isTerminalSessionStatus } from "./status";
import {
  deriveMobileWriteToken,
  generateMobileWriteTokenSeed,
  hashMobileWriteToken,
} from "./token-crypto";

const HANDOFF_TOKEN_TTL_MS = 5 * 60_000;
const HANDOFF_IDEMPOTENCY_WINDOW_MS = 60_000;
const HANDOFF_PAYLOAD_VERSION = 1;

type HandoffError = {
  code: "SESSION_NOT_FOUND" | "SESSION_EXPIRED" | "SESSION_IN_PROGRESS";
  status: 404 | 409 | 410;
};

type HandoffSuccess = {
  v: number;
  session_id: string;
  attempt_id: string;
  mobile_write_token: string;
  expires_at: string;
};

export type IssueHandoffResult =
  | {
      ok: false;
      error: HandoffError;
    }
  | {
      ok: true;
      data: HandoffSuccess;
    };

export async function issueHandoffPayload(
  sessionId: string,
  now: Date = new Date()
): Promise<IssueHandoffResult> {
  const [session] = await db
    .select({
      id: verification_sessions.id,
      environment: verification_sessions.environment,
      organizationId: verification_sessions.organizationId,
      status: verification_sessions.status,
      completedAt: verification_sessions.completedAt,
      createdAt: verification_sessions.createdAt,
      redirectUrl: verification_sessions.redirectUrl,
      shareFields: verification_sessions.shareFields,
      contractVersion: verification_sessions.contractVersion,
      expiresAt: verification_sessions.expiresAt,
      updatedAt: verification_sessions.updatedAt,
    })
    .from(verification_sessions)
    .where(eq(verification_sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return {
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        status: 404,
      },
    };
  }

  const normalizedSession = await expireVerificationSessionIfNeeded({
    now,
    row: session,
  });

  if (
    isTerminalSessionStatus(normalizedSession.status) ||
    normalizedSession.expiresAt.getTime() < now.getTime()
  ) {
    return {
      ok: false,
      error: {
        code: "SESSION_EXPIRED",
        status: 410,
      },
    };
  }

  if (normalizedSession.status === "in_progress") {
    return {
      ok: false,
      error: {
        code: "SESSION_IN_PROGRESS",
        status: 409,
      },
    };
  }

  const [latestAttempt] = await db
    .select({
      id: verification_attempts.id,
      status: verification_attempts.status,
      mobileWriteTokenSeed: verification_attempts.mobileWriteTokenSeed,
      mobileWriteTokenHash: verification_attempts.mobileWriteTokenHash,
      mobileWriteTokenIssuedAt: verification_attempts.mobileWriteTokenIssuedAt,
      mobileWriteTokenExpiresAt:
        verification_attempts.mobileWriteTokenExpiresAt,
      mobileWriteTokenConsumedAt:
        verification_attempts.mobileWriteTokenConsumedAt,
    })
    .from(verification_attempts)
    .where(eq(verification_attempts.verificationSessionId, session.id))
    .orderBy(desc(verification_attempts.createdAt))
    .limit(1);

  const reuseWindowCutoff = now.getTime() - HANDOFF_IDEMPOTENCY_WINDOW_MS;
  const canReuseAttempt = Boolean(
    latestAttempt &&
      latestAttempt.status === "in_progress" &&
      latestAttempt.mobileWriteTokenSeed &&
      latestAttempt.mobileWriteTokenHash &&
      latestAttempt.mobileWriteTokenIssuedAt &&
      latestAttempt.mobileWriteTokenExpiresAt &&
      !latestAttempt.mobileWriteTokenConsumedAt &&
      latestAttempt.mobileWriteTokenIssuedAt.getTime() >= reuseWindowCutoff &&
      latestAttempt.mobileWriteTokenExpiresAt.getTime() > now.getTime()
  );

  let attemptId: string;
  let issuedAt: Date;
  let expiresAt: Date;
  let mobileWriteTokenSeed: string;

  if (
    canReuseAttempt &&
    latestAttempt &&
    latestAttempt.mobileWriteTokenIssuedAt &&
    latestAttempt.mobileWriteTokenExpiresAt &&
    latestAttempt.mobileWriteTokenSeed
  ) {
    attemptId = latestAttempt.id;
    issuedAt = latestAttempt.mobileWriteTokenIssuedAt;
    expiresAt = latestAttempt.mobileWriteTokenExpiresAt;
    mobileWriteTokenSeed = latestAttempt.mobileWriteTokenSeed;
  } else {
    attemptId = generateId({
      type: "va",
      environment: normalizedSession.environment,
    });
    issuedAt = now;
    expiresAt = new Date(now.getTime() + HANDOFF_TOKEN_TTL_MS);
    mobileWriteTokenSeed = generateMobileWriteTokenSeed();
    const token = await deriveMobileWriteToken({
      sessionId: session.id,
      attemptId,
      issuedAt,
      seed: mobileWriteTokenSeed,
    });
    const tokenHash = await hashMobileWriteToken(token);

    await db.insert(verification_attempts).values({
      id: attemptId,
      verificationSessionId: session.id,
      status: "in_progress",
      mobileWriteTokenSeed,
      mobileWriteTokenHash: tokenHash,
      mobileWriteTokenIssuedAt: issuedAt,
      mobileWriteTokenExpiresAt: expiresAt,
      mobileWriteTokenConsumedAt: null,
    });
  }

  const mobileWriteToken = await deriveMobileWriteToken({
    sessionId: session.id,
    attemptId,
    issuedAt,
    seed: mobileWriteTokenSeed,
  });

  return {
    ok: true,
    data: {
      v: HANDOFF_PAYLOAD_VERSION,
      session_id: session.id,
      attempt_id: attemptId,
      mobile_write_token: mobileWriteToken,
      expires_at: expiresAt.toISOString(),
    },
  };
}
