import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import { webhook_endpoints } from "@kayle-id/database/schema/webhooks";
import { and, eq } from "drizzle-orm";
import { deleteWebhookEndpoint } from "@/openapi/v1/webhooks/endpoints/delete";

const deleteEndpoint = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

deleteEndpoint.openapi(deleteWebhookEndpoint, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");

  const [deleted] = await db
    .delete(webhook_endpoints)
    .where(
      and(
        eq(webhook_endpoints.id, params.endpoint_id),
        eq(webhook_endpoints.organizationId, organizationId)
      )
    )
    .returning({
      id: webhook_endpoints.id,
    });

  if (!deleted) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Webhook endpoint not found.",
          hint: "The webhook endpoint with the given ID was not found.",
          docs: "https://kayle.id/docs/api/webhooks/endpoints#delete",
        },
      },
      404
    );
  }

  return c.json(
    {
      data: {
        message: "Webhook endpoint deleted.",
        status: "success" as const,
      },
      error: null,
    },
    200
  );
});

export { deleteEndpoint };
