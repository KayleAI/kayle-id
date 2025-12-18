import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookEndpoint } from "@/openapi/models/webhook";

export const enableWebhookEndpoint = createRoute({
  method: "post",
  path: "/:endpoint_id/enable",
  request: {
    params: z.object({
      endpoint_id: z
        .string()
        .describe(
          "The ID of the webhook endpoint to enable (e.g. whe_live_...)."
        ),
    }),
  },
  tags: ["Webhooks"],
  summary: "Enable a webhook endpoint",
  description: "Convenience endpoint to mark a webhook endpoint as enabled.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: WebhookEndpoint,
            error: z.null(),
          }),
        },
      },
      description: "Webhook endpoint enabled.",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Webhook endpoint not found.",
                hint: "The webhook endpoint with the given ID was not found.",
                docs: "https://kayle.id/docs/api/webhooks/endpoints#enable",
              },
            },
          }),
        },
      },
      description: "Webhook endpoint not found.",
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
