import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookDelivery } from "@/openapi/models/webhook";

export const retryWebhookDelivery = createRoute({
  method: "post",
  path: "/:delivery_id/retry",
  request: {
    params: z.object({
      delivery_id: z
        .string()
        .describe(
          "The ID of the webhook delivery to retry (e.g. whd_live_...)."
        ),
    }),
  },
  tags: ["Webhooks"],
  summary: "Retry a webhook delivery",
  description:
    "Manually requeue a failed (or previously succeeded) webhook delivery for retry.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: WebhookDelivery,
            error: z.null(),
          }),
        },
      },
      description: "Webhook delivery requeued for retry.",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Webhook delivery not found.",
                hint: "The webhook delivery with the given ID was not found.",
                docs: "https://kayle.id/docs/api/webhooks/deliveries#retry",
              },
            },
          }),
        },
      },
      description: "Webhook delivery not found.",
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
