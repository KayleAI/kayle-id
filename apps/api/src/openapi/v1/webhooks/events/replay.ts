import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookEvent } from "@/openapi/models/webhook";

export const replayWebhookEvent = createRoute({
  method: "post",
  path: "/:event_id/replay",
  request: {
    params: z.object({
      event_id: z
        .string()
        .describe("The ID of the webhook event to replay (e.g. evt_live_...)."),
    }),
  },
  tags: ["Webhooks"],
  summary: "Replay a webhook event",
  description:
    "Manually requeue all deliveries for a replayable webhook event.",
  security: [{ bearerAuth: [] }],
  responses: {
    202: {
      content: {
        "application/json": {
          schema: z.object({
            data: WebhookEvent,
            error: z.null(),
          }),
        },
      },
      description: "Webhook event accepted for replay.",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Webhook event not found.",
                hint: "The webhook event with the given ID was not found.",
                docs: "https://kayle.id/docs/api/webhooks/events#replay",
              },
            },
          }),
        },
      },
      description: "Webhook event not found.",
    },
    409: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "CONFLICT",
                message: "Webhook event cannot be replayed.",
                hint: "Only succeeded verification events with deliveries can be replayed.",
                docs: "https://kayle.id/docs/api/webhooks/events#replay",
              },
            },
          }),
        },
      },
      description: "Webhook event cannot be replayed.",
    },
    500: {
      content: {
        "application/json": {
          schema: InternalServerErrorResponse,
        },
      },
      description: "Internal server error.",
    },
  },
});
