import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import {
  events,
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { and, eq, gt, gte, inArray, lte } from "drizzle-orm";
import { cancelSession } from "@/openapi/v1/sessions/cancel-by-id";
import { createSession } from "@/openapi/v1/sessions/create";
import { getSession } from "@/openapi/v1/sessions/get-by-id";
import { listSessions } from "@/openapi/v1/sessions/list";
import { generateId } from "@/utils/generate-id";

const sessions = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    environment: "live" | "test" | "either";
    type: "api" | "session";
  };
}>();

function buildVerificationUrl(id: string) {
  const base =
    process.env.NODE_ENV === "production"
      ? "https://verify.kayle.id"
      : "http://localhost:2999";
  const url = new URL(`/${id}`, base);

  return url.toString();
}

function mapSessionRowToResponse({
  row,
  verificationUrl,
  attempts,
}: {
  row: typeof verification_sessions.$inferSelect;
  verificationUrl: string;
  attempts?: (typeof verification_attempts.$inferSelect)[];
}) {
  return {
    id: row.id,
    environment: row.environment,
    status: row.status,
    redirect_url: row.redirectUrl ?? null,
    verification_url: verificationUrl,
    expires_at: row.expiresAt.toISOString(),
    completed_at: row.completedAt ? row.completedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    ...(attempts
      ? {
          attempts: attempts.map((attempt) => ({
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
          })),
        }
      : {}),
  };
}

sessions.openapi(listSessions, async (c) => {
  const organizationId = c.get("organizationId");
  const query = c.req.valid("query");

  const limit = query.limit ?? 10;

  const environment = c.get("environment");

  const where = and(
    eq(verification_sessions.organizationId, organizationId),
    ...(environment !== "either"
      ? [eq(verification_sessions.environment, environment)]
      : []),
    ...(query.status ? [eq(verification_sessions.status, query.status)] : []),
    ...(query.created_from
      ? [gte(verification_sessions.createdAt, new Date(query.created_from))]
      : []),
    ...(query.created_to
      ? [lte(verification_sessions.createdAt, new Date(query.created_to))]
      : []),
    ...(query.starting_after
      ? [gt(verification_sessions.id, query.starting_after)]
      : [])
  );

  const rows = await db
    .select()
    .from(verification_sessions)
    .where(where)
    .orderBy(verification_sessions.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null;

  let attemptsBySessionId: Record<
    string,
    (typeof verification_attempts.$inferSelect)[]
  > = {};

  if (pageRows.length > 0 && query.include_attempts) {
    const sessionIds = pageRows.map((row) => row.id);
    const attempts = await db
      .select()
      .from(verification_attempts)
      .where(inArray(verification_attempts.verificationSessionId, sessionIds));

    attemptsBySessionId = attempts.reduce<
      Record<string, (typeof verification_attempts.$inferSelect)[]>
    >((acc, attempt) => {
      const key = attempt.verificationSessionId;
      if (!acc[key]) {
        acc[key] = [];
      }

      acc[key].push(attempt);

      return acc;
    }, {});
  }

  const data = pageRows.map((row) =>
    mapSessionRowToResponse({
      row,
      verificationUrl: buildVerificationUrl(row.id),
      attempts: query.include_attempts
        ? (attemptsBySessionId[row.id] ?? [])
        : undefined,
    })
  );

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

sessions.openapi(createSession, async (c) => {
  const organizationId = c.get("organizationId");
  const query = c.req.valid("query") ?? {};
  const body = c.req.valid("json");

  const baseEnvironment = c.get("environment");
  const environment = baseEnvironment === "either" ? "live" : baseEnvironment;

  const redirectUrl = body.redirect_url ?? null;

  const id = generateId({ type: "vs", environment });

  const [created] = await db
    .insert(verification_sessions)
    .values({
      id,
      organizationId,
      environment,
      status: "created",
      redirectUrl,
    })
    .returning();

  const data = mapSessionRowToResponse({
    row: created,
    verificationUrl: buildVerificationUrl(created.id),
    attempts: query.include_attempts ? [] : undefined,
  });

  return c.json(
    {
      data,
      error: null,
    },
    200
  );
});

sessions.openapi(getSession, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");
  const query = c.req.valid("query") ?? {};

  const [row] = await db
    .select()
    .from(verification_sessions)
    .where(
      and(
        eq(verification_sessions.id, params.id),
        eq(verification_sessions.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Session not found.",
          hint: "The session with the given ID was not found.",
          docs: "https://kayle.id/docs/api/sessions#get-by-id",
        },
      },
      404
    );
  }

  let attempts: (typeof verification_attempts.$inferSelect)[] | undefined;

  if (query.include_attempts) {
    attempts = await db
      .select()
      .from(verification_attempts)
      .where(eq(verification_attempts.verificationSessionId, row.id));
  }

  const data = mapSessionRowToResponse({
    row,
    verificationUrl: buildVerificationUrl(row.id),
    attempts,
  });

  return c.json(
    {
      data,
      error: null,
    },
    200
  );
});

sessions.openapi(cancelSession, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");

  const [row] = await db
    .select()
    .from(verification_sessions)
    .where(
      and(
        eq(verification_sessions.id, params.id),
        eq(verification_sessions.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Session not found.",
          hint: "The session with the given ID was not found.",
          docs: "https://kayle.id/docs/api/sessions#cancel-by-id",
        },
      },
      404
    );
  }

  const now = new Date();

  if (!["completed", "expired", "cancelled"].includes(row.status)) {
    await db
      .update(verification_sessions)
      .set({
        status: "cancelled",
        completedAt: now,
      })
      .where(eq(verification_sessions.id, row.id));

    await db
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

    await db.insert(events).values({
      id: generateId({ type: "evt", environment: row.environment }),
      organizationId,
      environment: row.environment,
      type: "verification.session.cancelled",
      triggerId: row.id,
      triggerType: "verification_session",
    });
  }

  return c.body(null, 204);
});

export default sessions;
