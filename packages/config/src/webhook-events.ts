import { z } from "zod";

export const SUPPORTED_WEBHOOK_EVENT_TYPES = [
  "verification.attempt.succeeded",
  "verification.attempt.failed",
  "verification.session.expired",
  "verification.session.cancelled",
] as const;

export const webhookEventTypeSchema = z.enum(SUPPORTED_WEBHOOK_EVENT_TYPES);

export type SupportedWebhookEventType = z.infer<typeof webhookEventTypeSchema>;
