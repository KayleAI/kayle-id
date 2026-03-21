import type {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import type { ShareFields } from "@/v1/sessions/domain/share-contract/types";

function buildVerificationUrl(id: string) {
  const base =
    process.env.NODE_ENV === "production"
      ? "https://verify.kayle.id"
      : "http://localhost:2999";
  const url = new URL(`/${id}`, base);
  return url.toString();
}

export function mapAttemptRowToResponse(
  attempt: typeof verification_attempts.$inferSelect
) {
  return {
    id: attempt.id,
    session_id: attempt.verificationSessionId,
    status: attempt.status,
    failure_code: attempt.failureCode ?? null,
    risk_score: attempt.riskScore,
    completed_at: attempt.completedAt
      ? attempt.completedAt.toISOString()
      : null,
    created_at: attempt.createdAt.toISOString(),
    updated_at: attempt.updatedAt.toISOString(),
  };
}

export function mapSessionRowToResponse({
  row,
  attempts,
}: {
  row: typeof verification_sessions.$inferSelect;
  attempts?: (typeof verification_attempts.$inferSelect)[];
}) {
  return {
    id: row.id,
    status: row.status,
    contract_version: row.contractVersion,
    share_fields: row.shareFields as ShareFields,
    redirect_url: row.redirectUrl ?? null,
    verification_url: buildVerificationUrl(row.id),
    expires_at: row.expiresAt.toISOString(),
    completed_at: row.completedAt ? row.completedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    ...(attempts
      ? {
          attempts: attempts.map(mapAttemptRowToResponse),
        }
      : {}),
  };
}
