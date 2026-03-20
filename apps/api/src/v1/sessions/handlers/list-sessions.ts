import type { RouteHandler } from "@hono/zod-openapi";
import type { verification_attempts } from "@kayle-id/database/schema/core";
import type { listSessions } from "@/openapi/v1/sessions/list";
import { mapSessionRowToResponse } from "@/v1/sessions/mappers/session-response";
import {
  getAttemptsBySessionIds,
  listVerificationSessions,
} from "@/v1/sessions/repo/session-repo";
import type { SessionsAppEnv } from "@/v1/sessions/types";

export const listSessionsHandler: RouteHandler<
  typeof listSessions,
  SessionsAppEnv
> = async (c) => {
  const organizationId = c.get("organizationId");
  const query = c.req.valid("query");
  const environment = c.get("environment");
  const limit = query.limit ?? 10;

  const rows = await listVerificationSessions({
    organizationId,
    environment,
    status: query.status,
    createdFrom: query.created_from,
    createdTo: query.created_to,
    startingAfter: query.starting_after,
    limit,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null;

  let attemptsBySessionId: Record<
    string,
    (typeof verification_attempts.$inferSelect)[]
  > = {};
  if (query.include_attempts && pageRows.length > 0) {
    const attempts = await getAttemptsBySessionIds(
      pageRows.map((row) => row.id)
    );
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
};
