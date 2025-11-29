import { z } from "@hono/zod-openapi";

export const WebhookDelivery = z
  .object({
    id: z.string().describe("Webhook delivery ID"),
    event_id: z.string().describe("Event ID"),
    endpoint_id: z.string().describe("The ID of the webhook endpoint"),
    encryption_key_id: z
      .string()
      .describe("The ID of the encryption key used to encrypt the payload"),
    status: z.string().describe("The status of the webhook delivery"),
    attempt_count: z
      .number()
      .describe("The number of attempts made to deliver the webhook"),
    next_attempt_at: z.string().nullable().describe("The next attempt time"),
    last_status_code: z.number().nullable().describe("The last status code"),
    payload: z.string().describe("The payload of the webhook delivery"),
    last_attempt_at: z.string().nullable().describe("The last attempt time"),
  })
  .openapi("Webhook Delivery");

export const WebhookEndpoint = z
  .object({
    id: z.string().describe("The ID of the webhook endpoint"),
    url: z.string().url().describe("The URL of the webhook endpoint"),
    enabled: z.boolean().describe("Whether the webhook endpoint is enabled"),
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
