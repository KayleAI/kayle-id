import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import { webhook_endpoints } from "@kayle-id/database/schema/webhooks";
import { and, eq, gt } from "drizzle-orm";
import { createWebhookEndpoint } from "@/openapi/v1/webhooks/endpoints/create";
import { listWebhookEndpoints } from "@/openapi/v1/webhooks/endpoints/list";
import {
  type Environment,
  generateEndpointId,
  mapEndpointRowToResponse,
} from "./utils";

const listAndCreateEndpoints = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

listAndCreateEndpoints.openapi(listWebhookEndpoints, async (c) => {
  const organizationId = c.get("organizationId");
  const query = c.req.valid("query");

  const limit = query.limit ?? 10;

  const where = and(
    eq(webhook_endpoints.organizationId, organizationId),
    ...(query.environment
      ? [eq(webhook_endpoints.environment, query.environment)]
      : []),
    ...(typeof query.enabled === "boolean"
      ? [eq(webhook_endpoints.enabled, query.enabled)]
      : []),
    ...(query.starting_after
      ? [gt(webhook_endpoints.id, query.starting_after)]
      : [])
  );

  const rows = await db
    .select()
    .from(webhook_endpoints)
    .where(where)
    .orderBy(webhook_endpoints.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null;

  const data = pageRows.map((row) =>
    mapEndpointRowToResponse(row, organizationId)
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

listAndCreateEndpoints.openapi(createWebhookEndpoint, async (c) => {
  const organizationId = c.get("organizationId");
  const body = c.req.valid("json");

  const environment: Environment = (body.environment as Environment) ?? "live";
  const enabled = body.enabled ?? true;

  const id = generateEndpointId(environment);

  const [created] = await db
    .insert(webhook_endpoints)
    .values({
      id,
      organizationId,
      environment,
      url: body.url,
      enabled,
      disabledAt: enabled ? null : new Date(),
    })
    .returning();

  const data = mapEndpointRowToResponse(created, organizationId);

  return c.json(
    {
      data,
      error: null,
    },
    200
  );
});

export { listAndCreateEndpoints };
