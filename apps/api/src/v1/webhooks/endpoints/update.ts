import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import { webhook_endpoints } from "@kayle-id/database/schema/webhooks";
import { and, eq } from "drizzle-orm";
import { updateWebhookEndpoint } from "@/openapi/v1/webhooks/endpoints/update";
import { mapEndpointRowToResponse } from "./utils";

const updateEndpoint = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

updateEndpoint.openapi(updateWebhookEndpoint, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");
  const body = c.req.valid("json");

  const [row] = await db
    .select()
    .from(webhook_endpoints)
    .where(
      and(
        eq(webhook_endpoints.id, params.endpoint_id),
        eq(webhook_endpoints.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Webhook endpoint not found.",
          hint: "The webhook endpoint with the given ID was not found.",
          docs: "https://kayle.id/docs/api/webhooks/endpoints#update",
        },
      },
      404
    );
  }

  const updates: Partial<typeof webhook_endpoints.$inferInsert> = {};

  if (body.url !== undefined) {
    updates.url = body.url;
  }

  if (typeof body.enabled === "boolean") {
    updates.enabled = body.enabled;
    updates.disabledAt = body.enabled ? null : new Date();
  }

  if (Object.keys(updates).length === 0) {
    return c.json(
      {
        data: null,
        error: {
          code: "BAD_REQUEST",
          message: "Bad request.",
          hint: "At least one of `url` or `enabled` must be provided.",
          docs: "https://kayle.id/docs/api/webhooks/endpoints#update",
        },
      },
      400
    );
  }

  await db
    .update(webhook_endpoints)
    .set(updates)
    .where(eq(webhook_endpoints.id, row.id));

  const [updated] = await db
    .select()
    .from(webhook_endpoints)
    .where(eq(webhook_endpoints.id, row.id))
    .limit(1);

  const data = mapEndpointRowToResponse(updated, organizationId);

  return c.json(
    {
      data,
      error: null,
    },
    200
  );
});

export { updateEndpoint };
