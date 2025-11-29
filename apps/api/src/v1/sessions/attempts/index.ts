import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { and, eq, gt } from "drizzle-orm";
import { listSessionAttempts } from "@/openapi/v1/sessions/attempts/list";

const sessionAttempts = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
  };
}>();

sessionAttempts.openapi(listSessionAttempts, async (c) => {
  const organizationId = c.get("organizationId");
  const query = c.req.valid("query");

  if (!(query.session_id || query.status)) {
    const limit = query.limit ?? 10;

    return c.json(
      {
        data: null,
        error: {
          code: "BAD_REQUEST",
          message: "Bad request.",
          hint: "You must provide at least one filter: `session_id` or `status`.",
          docs: "https://kayle.id/docs/api/sessions/attempts",
        },
        pagination: {
          limit,
          has_more: false,
          next_cursor: null,
        },
      },
      400
    );
  }

  const limit = query.limit ?? 10;

  const where = and(
    eq(verification_sessions.organizationId, organizationId),
    ...(query.session_id
      ? [eq(verification_sessions.id, query.session_id)]
      : []),
    ...(query.status ? [eq(verification_attempts.status, query.status)] : []),
    ...(query.starting_after
      ? [gt(verification_attempts.id, query.starting_after)]
      : [])
  );

  const rows = await db
    .select({
      attempt: verification_attempts,
    })
    .from(verification_attempts)
    .innerJoin(
      verification_sessions,
      eq(verification_sessions.id, verification_attempts.verificationSessionId)
    )
    .where(where)
    .orderBy(verification_attempts.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (pageRows.at(-1)?.attempt.id ?? null) : null;

  const data = pageRows.map(({ attempt }) => ({
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
  }));

  return c.json(
    {
      data,
      error: null,
      pagination: {
        limit,
        has_more: hasMore,
        next_cursor: nextCursor,
      },
    },
    200
  );
});

export default sessionAttempts;
