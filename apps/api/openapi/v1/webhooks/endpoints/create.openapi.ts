import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookEndpoint } from "@/openapi/models/webhook";

export const createWebhookEndpoint = createRoute({
  method: "post",
  path: "/",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              url: z
                .string()
                .url()
                .describe("The URL of the webhook endpoint.")
                .openapi({ example: "https://example.com/webhooks/kayle" }),
              environment: z
                .enum(["live", "test"])
                .optional()
                .describe(
                  'The environment for the endpoint. Defaults to "live".'
                ),
              enabled: z
                .boolean()
                .optional()
                .describe(
                  "Whether the endpoint should be enabled immediately. Defaults to true."
                ),
            })
            .openapi("CreateWebhookEndpointRequest"),
        },
      },
    },
  },
  tags: ["Webhooks"],
  summary: "Create a webhook endpoint",
  description: "Create a webhook endpoint for the authenticated organization.",
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
                hint: "The request payload is invalid.",
                docs: "https://kayle.id/docs/api/webhooks/endpoints#create",
              },
            },
          }),
        },
      },
      description: "Bad request.",
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
