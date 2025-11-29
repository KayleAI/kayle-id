import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import {
  webhook_encryption_keys,
  webhook_endpoints,
} from "@kayle-id/database/schema/webhooks";
import { and, eq, gt } from "drizzle-orm";
import { createWebhookEncryptionKey } from "@/openapi/v1/webhooks/keys/create";
import { listWebhookEncryptionKeys } from "@/openapi/v1/webhooks/keys/list";
import { type Environment, generateKeyId, mapKeyRowToResponse } from "./utils";

const endpointKeys = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

endpointKeys.openapi(createWebhookEncryptionKey, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");
  const body = c.req.valid("json");

  const [endpoint] = await db
    .select()
    .from(webhook_endpoints)
    .where(
      and(
        eq(webhook_endpoints.id, params.endpoint_id),
        eq(webhook_endpoints.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!endpoint) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Webhook endpoint not found.",
          hint: "The webhook endpoint with the given ID was not found.",
          docs: "https://kayle.id/docs/api/webhooks/keys#create",
        },
      },
      404
    );
  }

  const environment = endpoint.environment as Environment;
  const id = generateKeyId(environment);

  const [created] = await db
    .insert(webhook_encryption_keys)
    .values({
      id,
      webhookEndpointId: endpoint.id,
      keyId: body.key_id,
      algorithm: body.algorithm,
      keyType: body.key_type,
      jwk: body.jwk,
      isActive: true,
    })
    .returning();

  const data = mapKeyRowToResponse(created);

  return c.json(
    {
      data,
      error: null,
    },
    200
  );
});

endpointKeys.openapi(listWebhookEncryptionKeys, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");
  const query = c.req.valid("query");

  const [endpoint] = await db
    .select()
    .from(webhook_endpoints)
    .where(
      and(
        eq(webhook_endpoints.id, params.endpoint_id),
        eq(webhook_endpoints.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!endpoint) {
    return c.json(
      {
        data: [],
        error: null,
        pagination: {
          limit: query.limit ?? 10,
          has_more: false,
          next_cursor: null,
        },
      },
      200
    );
  }

  const limit = query.limit ?? 10;

  const where = and(
    eq(webhook_encryption_keys.webhookEndpointId, endpoint.id),
    ...(typeof query.is_active === "boolean"
      ? [eq(webhook_encryption_keys.isActive, query.is_active)]
      : []),
    ...(query.starting_after
      ? [gt(webhook_encryption_keys.id, query.starting_after)]
      : [])
  );

  const rows = await db
    .select()
    .from(webhook_encryption_keys)
    .where(where)
    .orderBy(webhook_encryption_keys.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (pageRows.at(-1)?.id ?? null) : null;

  const data = pageRows.map(mapKeyRowToResponse);

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

export { endpointKeys };
