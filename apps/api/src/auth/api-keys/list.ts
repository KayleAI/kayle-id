import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import { api_keys } from "@kayle-id/database/schema/core";
import { and, eq, gt } from "drizzle-orm";
import { internalListApiKeys } from "openapi/api-keys/list";

const listApiKeys = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string; type: "api" | "session" };
}>();

listApiKeys.openapi(internalListApiKeys, async (c) => {
  const organizationId = c.get("organizationId");

  const query = c.req.valid("query");
  const limit = query.limit ?? 10;

  try {
    const where = and(
      eq(api_keys.organizationId, organizationId),
      ...(query.starting_after ? [gt(api_keys.id, query.starting_after)] : [])
    );

    const rows = await db
      .select({
        id: api_keys.id,
        name: api_keys.name,
        enabled: api_keys.enabled,
        permissions: api_keys.permissions,
        metadata: api_keys.metadata,
        createdAt: api_keys.createdAt,
        updatedAt: api_keys.updatedAt,
        requestCount: api_keys.requestCount,
      })
      .from(api_keys)
      .where(where)
      .orderBy(api_keys.id)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null;

    const data = pageRows.map((row) => ({
      ...row,
      permissions: Array.isArray(row.permissions) ? row.permissions : [],
      metadata:
        row.metadata &&
        typeof row.metadata === "object" &&
        !Array.isArray(row.metadata)
          ? row.metadata
          : {},
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
  } catch {
    return c.json(
      {
        data: null,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
          hint: "Please try again later.",
          docs: "https://kayle.id/docs/api/errors#internal_server_error",
        } as const,
        pagination: {
          limit,
          has_more: false,
          next_cursor: null,
        },
      },
      500
    );
  }
});

export { listApiKeys };
