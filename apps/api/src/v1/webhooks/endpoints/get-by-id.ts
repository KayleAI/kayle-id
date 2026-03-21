import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import { webhook_endpoints } from "@kayle-id/database/schema/webhooks";
import { and, eq } from "drizzle-orm";
import { getWebhookEndpoint } from "@/openapi/v1/webhooks/endpoints/get-by-id";
import { mapEndpointRowToResponse } from "./utils";

const endpointById = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

endpointById.openapi(getWebhookEndpoint, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");

  const [row] = await db
    .select()
    .from(webhook_endpoints)
    .where(
      and(
        eq(webhook_endpoints.id, params.endpoint_id),
        eq(webhook_endpoints.organizationId, organizationId),
        eq(webhook_endpoints.environment, "live")
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
          docs: "https://kayle.id/docs/api/webhooks/endpoints#get-by-id",
        },
      },
      404
    );
  }

  const data = mapEndpointRowToResponse(row, organizationId);

  return c.json(
    {
      data,
      error: null,
    },
    200
  );
});

export { endpointById };
