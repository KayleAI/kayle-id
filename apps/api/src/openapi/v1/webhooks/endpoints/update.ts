import { createRoute, z } from "@hono/zod-openapi";
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
              url: z
                .string()
                .url()
                .optional()
                .describe("New URL for the webhook endpoint."),
              enabled: z
                .boolean()
                .optional()
                .describe("New enabled state for the webhook endpoint."),
            })
            .refine(
              (body) => body.url !== undefined || body.enabled !== undefined,
              {
                message: "At least one of `url` or `enabled` must be provided.",
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
                hint: "At least one of `url` or `enabled` must be provided.",
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
