import { z } from "@hono/zod-openapi";
import {
  SUPPORTED_WEBHOOK_EVENT_TYPES,
  webhookEventTypeSchema,
} from "@kayle-id/config/webhook-events";

export const WebhookDelivery = z
  .object({
    id: z.string().describe("Webhook delivery ID"),
    event_id: z.string().describe("Event ID"),
    webhook_endpoint_id: z
      .string()
      .describe("The ID of the webhook endpoint this delivery targets"),
    webhook_encryption_key_id: z
      .string()
      .nullable()
      .describe(
        "The ID of the encryption key used to encrypt the payload for this delivery"
      ),
    status: z
      .enum(["pending", "delivering", "succeeded", "failed"])
      .describe("The status of the webhook delivery"),
    attempt_count: z
      .number()
      .describe("The number of attempts made to deliver the webhook"),
    next_attempt_at: z
      .string()
      .nullable()
      .describe(
        "The next time this delivery should be attempted, or null if ready to send."
      ),
    last_status_code: z
      .number()
      .nullable()
      .describe(
        "The last HTTP status code received from the endpoint, if any."
      ),
    last_attempt_at: z
      .string()
      .nullable()
      .describe("The time the last delivery attempt was made, if any."),
    created_at: z.string().describe("The time the delivery was created"),
    updated_at: z.string().describe("The time the delivery was last updated"),
  })
  .openapi("Webhook Delivery");

export const WebhookEndpoint = z
  .object({
    id: z.string().describe("The ID of the webhook endpoint"),
    organization_id: z
      .string()
      .describe("The ID of the organization that owns this endpoint"),
    name: z
      .string()
      .nullable()
      .describe("An optional display name for the webhook endpoint."),
    url: z.string().url().describe("The URL of the webhook endpoint"),
    enabled: z.boolean().describe("Whether the webhook endpoint is enabled"),
    subscribed_event_types: z
      .array(webhookEventTypeSchema)
      .describe(
        `The event types this endpoint is subscribed to. Supported values: ${SUPPORTED_WEBHOOK_EVENT_TYPES.join(
          ", "
        )}.`
      ),
    created_at: z
      .string()
      .describe("The time the webhook endpoint was created"),
    updated_at: z
      .string()
      .describe("The time the webhook endpoint was last updated"),
    disabled_at: z
      .string()
      .nullable()
      .describe("The time the webhook endpoint was disabled, null if enabled"),
  })
  .openapi("Webhook Endpoint");

export const CreatedWebhookEndpoint = z
  .object({
    endpoint: WebhookEndpoint,
    signing_secret: z
      .string()
      .describe("The webhook signing secret. This value is shown only once."),
  })
  .openapi("Created Webhook Endpoint");

export const RotatedWebhookSigningSecret = z
  .object({
    endpoint_id: z.string().describe("The webhook endpoint ID"),
    signing_secret: z
      .string()
      .describe(
        "The rotated webhook signing secret. This value is shown only once."
      ),
  })
  .openapi("Rotated Webhook Signing Secret");

export const RevealedWebhookSigningSecret = z
  .object({
    endpoint_id: z.string().describe("The webhook endpoint ID"),
    signing_secret: z
      .string()
      .describe("The current webhook signing secret for the endpoint."),
  })
  .openapi("Revealed Webhook Signing Secret");

export const WebhookEncryptionKey = z
  .object({
    id: z.string().describe("The ID of the webhook encryption key"),
    webhook_endpoint_id: z
      .string()
      .describe("The ID of the webhook endpoint this key belongs to"),
    key_id: z
      .string()
      .describe("The key identifier, used as `kid` in the JWE header"),
    algorithm: z.string().describe("The JWE algorithm (e.g. ECDH-ES)"),
    key_type: z.string().describe("The JWK key type (e.g. EC)"),
    jwk: z
      .record(z.string(), z.unknown())
      .describe("The public JWK used to encrypt webhook payloads"),
    is_active: z
      .boolean()
      .describe("Whether this key is active for new webhook deliveries"),
    created_at: z.string().describe("The time the key was created"),
    updated_at: z.string().describe("The time the key was last updated"),
    disabled_at: z
      .string()
      .nullable()
      .describe("The time the key was disabled, null if still active"),
  })
  .openapi("Webhook Encryption Key");

export const WebhookEventDelivery = z.object({
  id: z.string().describe("Webhook delivery ID"),
  webhook_endpoint_id: z
    .string()
    .describe("The ID of the webhook endpoint this delivery targets"),
  status: z
    .enum(["pending", "delivering", "succeeded", "failed"])
    .describe("The status of the webhook delivery"),
  last_status_code: z
    .number()
    .nullable()
    .describe("The last HTTP status code received from the endpoint, if any."),
  attempt_count: z
    .number()
    .describe("The number of attempts made to deliver the webhook"),
  last_attempt_at: z
    .string()
    .nullable()
    .describe("The time the last delivery attempt was made, if any."),
});

export const WebhookEvent = z
  .object({
    id: z.string().describe("Event ID"),
    type: z
      .string()
      .describe(
        'The type of the event (e.g. "verification.attempt.succeeded").'
      ),
    trigger_type: z
      .enum(["verification_session", "verification_attempt"])
      .describe("The type of object that triggered this event."),
    trigger_id: z
      .string()
      .describe(
        "The ID of the object that triggered this event (e.g. a verification session or attempt ID)."
      ),
    created_at: z.string().describe("The time the event was created."),
    deliveries: z
      .array(WebhookEventDelivery)
      .describe("Deliveries associated with this event."),
  })
  .openapi("Webhook Event");
