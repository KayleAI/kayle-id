import { db } from "@kayle-id/database/drizzle";
import {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";
import { isTerminalAttemptStatus } from "./status";
import { hashMobileDeviceId, hashMobileWriteToken } from "./token-crypto";

export type HelloPayload = {
  attemptId?: string;
  mobileWriteToken?: string;
  deviceId?: string;
  appVersion?: string;
};

export type ParsedHelloPayload = {
  attemptId: string;
  mobileWriteToken: string;
  deviceId: string;
  appVersion: string;
};

export function parseHelloPayload(
  payload: HelloPayload
): ParsedHelloPayload | null {
  const parsed = {
    attemptId: payload.attemptId?.trim() ?? "",
    mobileWriteToken: payload.mobileWriteToken?.trim() ?? "",
    deviceId: payload.deviceId?.trim() ?? "",
    appVersion: payload.appVersion?.trim() ?? "",
  };

  if (!(parsed.attemptId && parsed.mobileWriteToken && parsed.deviceId)) {
    return null;
  }

  return parsed;
}

export async function getAttemptForHello(
  verificationSessionId: string,
  attemptId: string
) {
  const [attempt] = await db
    .select({
      id: verification_attempts.id,
      status: verification_attempts.status,
      mobileWriteTokenHash: verification_attempts.mobileWriteTokenHash,
      mobileWriteTokenExpiresAt:
        verification_attempts.mobileWriteTokenExpiresAt,
      mobileWriteTokenConsumedAt:
        verification_attempts.mobileWriteTokenConsumedAt,
      mobileHelloDeviceIdHash: verification_attempts.mobileHelloDeviceIdHash,
    })
    .from(verification_attempts)
    .where(
      and(
        eq(verification_attempts.id, attemptId),
        eq(verification_attempts.verificationSessionId, verificationSessionId)
      )
    )
    .limit(1);

  return attempt ?? null;
}

export type HelloAuthState =
  | {
      kind: "error";
      code:
        | "HANDOFF_TOKEN_INVALID"
        | "HANDOFF_TOKEN_EXPIRED"
        | "HANDOFF_TOKEN_CONSUMED"
        | "HANDOFF_DEVICE_MISMATCH";
    }
  | {
      kind: "resume";
    }
  | {
      kind: "consume";
      deviceIdHash: string;
    };

export async function resolveHelloAuthState({
  attempt,
  mobileWriteToken,
  deviceId,
  nowMs,
}: {
  attempt: NonNullable<Awaited<ReturnType<typeof getAttemptForHello>>>;
  mobileWriteToken: string;
  deviceId: string;
  nowMs: number;
}): Promise<HelloAuthState> {
  if (!attempt.mobileWriteTokenHash) {
    return {
      kind: "error",
      code: "HANDOFF_TOKEN_INVALID",
    };
  }

  const providedTokenHash = await hashMobileWriteToken(mobileWriteToken);
  if (providedTokenHash !== attempt.mobileWriteTokenHash) {
    return {
      kind: "error",
      code: "HANDOFF_TOKEN_INVALID",
    };
  }

  const deviceIdHash = await hashMobileDeviceId(deviceId);

  if (attempt.mobileWriteTokenConsumedAt) {
    if (!attempt.mobileHelloDeviceIdHash) {
      return {
        kind: "error",
        code: "HANDOFF_TOKEN_CONSUMED",
      };
    }

    if (attempt.mobileHelloDeviceIdHash !== deviceIdHash) {
      return {
        kind: "error",
        code: "HANDOFF_DEVICE_MISMATCH",
      };
    }

    return { kind: "resume" };
  }

  const expiresAtMs = attempt.mobileWriteTokenExpiresAt?.getTime() ?? 0;
  if (expiresAtMs <= nowMs) {
    return {
      kind: "error",
      code: "HANDOFF_TOKEN_EXPIRED",
    };
  }

  return {
    kind: "consume",
    deviceIdHash,
  };
}

export async function consumeHelloAttempt({
  attemptId,
  deviceIdHash,
  appVersion,
}: {
  attemptId: string;
  deviceIdHash: string;
  appVersion: string;
}): Promise<void> {
  await db
    .update(verification_attempts)
    .set({
      mobileWriteTokenConsumedAt: new Date(),
      mobileHelloDeviceIdHash: deviceIdHash,
      mobileHelloAppVersion: appVersion || null,
    })
    .where(eq(verification_attempts.id, attemptId));
}

export async function markSessionInProgress(session: {
  id: string;
  status: string;
}): Promise<void> {
  if (session.status === "in_progress") {
    return;
  }

  await db
    .update(verification_sessions)
    .set({
      status: "in_progress",
    })
    .where(eq(verification_sessions.id, session.id));

  session.status = "in_progress";
}

export function isAttemptMissingOrTerminal(
  attempt: Awaited<ReturnType<typeof getAttemptForHello>>
): boolean {
  if (!attempt) {
    return true;
  }

  return isTerminalAttemptStatus(attempt.status);
}
