import type { z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import { events } from "@kayle-id/database/schema/core";
import { webhook_deliveries } from "@kayle-id/database/schema/webhooks";
import { and, eq } from "drizzle-orm";
import type { WebhookEvent } from "@/openapi/models/webhook";
import { getWebhookEvent } from "@/openapi/v1/webhooks/events/get-by-id";

type WebhookEventResponse = z.infer<typeof WebhookEvent>;

const getEventById = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string };
}>();

getEventById.openapi(getWebhookEvent, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");

  const [event] = await db
    .select({
      id: events.id,
      type: events.type,
      trigger_type: events.triggerType,
      trigger_id: events.triggerId,
      environment: events.environment,
      created_at: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eq(events.id, params.event_id),
        eq(events.organizationId, organizationId)
      )
    );

  if (!event) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Webhook event not found.",
          hint: "The webhook event with the given ID was not found.",
          docs: "https://kayle.id/docs/api/webhooks/events#get-by-id",
        },
      },
      404
    );
  }

  const deliveries = await db
    .select({
      id: webhook_deliveries.id,
      webhook_endpoint_id: webhook_deliveries.webhookEndpointId,
      status: webhook_deliveries.status,
      last_status_code: webhook_deliveries.lastStatusCode,
      attempt_count: webhook_deliveries.attemptCount,
      last_attempt_at: webhook_deliveries.lastAttemptAt,
    })
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.eventId, event.id));

  const response: WebhookEventResponse = {
    id: event.id,
    type: event.type,
    // The database stores triggerType as a generic text column; at the API layer
    // we only expose the documented subset of values.
    trigger_type: event.trigger_type as WebhookEventResponse["trigger_type"],
    trigger_id: event.trigger_id,
    environment: event.environment as WebhookEventResponse["environment"],
    created_at: event.created_at.toISOString(),
    deliveries: deliveries.map((delivery) => ({
      ...delivery,
      last_attempt_at: delivery.last_attempt_at?.toISOString() ?? null,
    })),
  };

  return c.json(
    {
      data: response,
      error: null,
    },
    200
  );
});

export { getEventById };
