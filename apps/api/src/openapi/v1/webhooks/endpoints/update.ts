import { createRoute, z } from "@hono/zod-openapi";
import { webhookEventTypeSchema } from "@kayle-id/config/webhook-events";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookEndpoint } from "@/openapi/models/webhook";

export const updateWebhookEndpoint = createRoute({
  method: "patch",
  path: "/:endpoint_id",
  request: {
    params: z.object({
      endpoint_id: z
        .string()
        .describe(
          "The ID of the webhook endpoint to update (e.g. whe_live_...)."
        ),
    }),
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              name: z
                .string()
                .trim()
                .min(1)
                .max(120)
                .nullable()
                .optional()
                .describe("Updated display name for the webhook endpoint."),
              url: z
                .string()
                .url()
                .optional()
                .describe("New URL for the webhook endpoint."),
              enabled: z
                .boolean()
                .optional()
                .describe("New enabled state for the webhook endpoint."),
              subscribed_event_types: z
                .array(webhookEventTypeSchema)
                .optional()
                .describe("The updated event subscriptions for the endpoint."),
            })
            .refine(
              (body) =>
                body.name !== undefined ||
                body.url !== undefined ||
                body.enabled !== undefined ||
                body.subscribed_event_types !== undefined,
              {
                message:
                  "At least one of `name`, `url`, `enabled` or `subscribed_event_types` must be provided.",
              }
            )
            .openapi("UpdateWebhookEndpointRequest"),
        },
      },
    },
  },
  tags: ["Webhooks"],
  summary: "Update a webhook endpoint",
  description: "Update URL and/or enabled state of a webhook endpoint.",
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
      description: "Successful operation.",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "BAD_REQUEST",
                message: "Bad request.",
                hint: "At least one of `name`, `url`, `enabled` or `subscribed_event_types` must be provided.",
                docs: "https://kayle.id/docs/api/webhooks/endpoints#update",
              },
            },
          }),
        },
      },
      description: "Bad request.",
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
                docs: "https://kayle.id/docs/api/webhooks/endpoints#update",
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
