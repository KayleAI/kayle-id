import type { VerifyShareRequest } from "@kayle-id/capnp/verify-codec";
import { db } from "@kayle-id/database/drizzle";
import { verification_sessions } from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";
import { expireVerificationSessionIfNeeded } from "@/v1/sessions/repo/session-repo";
import { createShareRequestPayload } from "./share-manifest";
import { isTerminalSessionStatus } from "./status";

export type ActiveVerifySession = typeof verification_sessions.$inferSelect;

export type ActiveVerifySessionContext = {
  session: ActiveVerifySession;
  shareRequestPayload: VerifyShareRequest;
};

export async function loadActiveVerifySession(sessionId: string): Promise<
  | {
      ok: false;
      code: "SESSION_EXPIRED" | "SESSION_NOT_FOUND";
    }
  | {
      ok: true;
      value: ActiveVerifySessionContext;
    }
> {
  const [sessionRow] = await db
    .select()
    .from(verification_sessions)
    .where(
      and(
        eq(verification_sessions.id, sessionId),
        eq(verification_sessions.environment, "live")
      )
    )
    .limit(1);

  if (!sessionRow) {
    return {
      ok: false,
      code: "SESSION_NOT_FOUND",
    };
  }

  const session = await expireVerificationSessionIfNeeded({
    row: sessionRow,
  });

  if (
    isTerminalSessionStatus(session.status) ||
    session.expiresAt.getTime() < Date.now()
  ) {
    return {
      ok: false,
      code: "SESSION_EXPIRED",
    };
  }

  return {
    ok: true,
    value: {
      session,
      shareRequestPayload: createShareRequestPayload({
        contractVersion: session.contractVersion,
        sessionId: session.id,
        shareFieldsInput: session.shareFields,
      }),
    },
  };
}
