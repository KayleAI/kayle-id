import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookEvent } from "@/openapi/models/webhook";

export const getWebhookEvent = createRoute({
  method: "get",
  path: "/:event_id",
  request: {
    params: z.object({
      event_id: z
        .string()
        .describe(
          "The ID of the webhook event to retrieve (e.g. evt_live_...)."
        ),
    }),
  },
  tags: ["Webhooks"],
  summary: "Get a webhook event",
  description: "Fetch a single webhook event with its deliveries.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: WebhookEvent,
            error: z.null(),
          }),
        },
      },
      description: "Successful operation.",
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
                docs: "https://kayle.id/docs/api/webhooks/events#get-by-id",
              },
            },
          }),
        },
      },
      description: "Webhook event not found.",
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
