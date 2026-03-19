import { db } from "@kayle-id/database/drizzle";
import { events } from "@kayle-id/database/schema/core";
import { webhook_deliveries } from "@kayle-id/database/schema/webhooks";
import { and, eq } from "drizzle-orm";
import type { WebhookEvent } from "@/openapi/models/webhook";

type WebhookEventResponse = (typeof WebhookEvent)["_output"];

function mapWebhookEventDelivery(delivery: {
  attempt_count: number;
  id: string;
  last_attempt_at: Date | null;
  last_status_code: number | null;
  status: "delivering" | "failed" | "pending" | "succeeded";
  webhook_endpoint_id: string;
}): WebhookEventResponse["deliveries"][number] {
  return {
    attempt_count: delivery.attempt_count,
    id: delivery.id,
    last_attempt_at: delivery.last_attempt_at?.toISOString() ?? null,
    last_status_code: delivery.last_status_code,
    status: delivery.status,
    webhook_endpoint_id: delivery.webhook_endpoint_id,
  };
}

export async function getWebhookEventForOrganization({
  eventId,
  organizationId,
}: {
  eventId: string;
  organizationId: string;
}): Promise<WebhookEventResponse | null> {
  const [event] = await db
    .select({
      created_at: events.createdAt,
      environment: events.environment,
      id: events.id,
      trigger_id: events.triggerId,
      trigger_type: events.triggerType,
      type: events.type,
    })
    .from(events)
    .where(
      and(eq(events.id, eventId), eq(events.organizationId, organizationId))
    )
    .limit(1);

  if (!event) {
    return null;
  }

  const deliveries = await db
    .select({
      attempt_count: webhook_deliveries.attemptCount,
      id: webhook_deliveries.id,
      last_attempt_at: webhook_deliveries.lastAttemptAt,
      last_status_code: webhook_deliveries.lastStatusCode,
      status: webhook_deliveries.status,
      webhook_endpoint_id: webhook_deliveries.webhookEndpointId,
    })
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.eventId, event.id));

  return {
    created_at: event.created_at.toISOString(),
    deliveries: deliveries.map(mapWebhookEventDelivery),
    environment: event.environment as WebhookEventResponse["environment"],
    id: event.id,
    trigger_id: event.trigger_id,
    trigger_type: event.trigger_type as WebhookEventResponse["trigger_type"],
    type: event.type,
  };
}
