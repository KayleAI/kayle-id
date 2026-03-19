import { OpenAPIHono } from "@hono/zod-openapi";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { events } from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";
import { replayWebhookEvent } from "@/openapi/v1/webhooks/events/replay";
import { waitUntilIfAvailable } from "@/utils/wait-until";
import {
  attemptWebhookDelivery,
  requeueWebhookDeliveriesForEvent,
} from "@/v1/webhooks/deliveries/service";
import { getWebhookEventForOrganization } from "./utils";

const replayEvent = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string };
}>();

replayEvent.openapi(replayWebhookEvent, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");

  const [event] = await db
    .select({
      id: events.id,
      type: events.type,
    })
    .from(events)
    .where(
      and(
        eq(events.id, params.event_id),
        eq(events.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!event) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Webhook event not found.",
          hint: "The webhook event with the given ID was not found.",
          docs: "https://kayle.id/docs/api/webhooks/events#replay",
        },
      },
      404
    );
  }

  if (event.type !== "verification.attempt.succeeded") {
    return c.json(
      {
        data: null,
        error: {
          code: "CONFLICT",
          message: "Webhook event cannot be replayed.",
          hint: "Only succeeded verification events with deliveries can be replayed.",
          docs: "https://kayle.id/docs/api/webhooks/events#replay",
        },
      },
      409
    );
  }

  const requeuedDeliveries = await requeueWebhookDeliveriesForEvent({
    eventId: event.id,
  });

  if (requeuedDeliveries.length === 0) {
    return c.json(
      {
        data: null,
        error: {
          code: "CONFLICT",
          message: "Webhook event cannot be replayed.",
          hint: "Only succeeded verification events with deliveries can be replayed.",
          docs: "https://kayle.id/docs/api/webhooks/events#replay",
        },
      },
      409
    );
  }

  waitUntilIfAvailable({
    createTask: () =>
      Promise.allSettled(
        requeuedDeliveries.map((delivery) =>
          attemptWebhookDelivery({
            authSecret: c.env?.AUTH_SECRET ?? env.AUTH_SECRET,
            deliveryId: delivery.id,
          })
        )
      ),
    getExecutionCtx: () => c.executionCtx,
  });

  const response = await getWebhookEventForOrganization({
    eventId: event.id,
    organizationId,
  });

  if (!response) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Webhook event not found.",
          hint: "The webhook event with the given ID was not found.",
          docs: "https://kayle.id/docs/api/webhooks/events#replay",
        },
      },
      404
    );
  }

  return c.json(
    {
      data: response,
      error: null,
    },
    202
  );
});

export { replayEvent };
