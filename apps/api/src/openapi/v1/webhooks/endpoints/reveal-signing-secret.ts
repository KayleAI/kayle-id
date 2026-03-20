import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { RevealedWebhookSigningSecret } from "@/openapi/models/webhook";

export const revealWebhookEndpointSigningSecret = createRoute({
  method: "post",
  path: "/:endpoint_id/signing-secret/reveal",
  request: {
    params: z.object({
      endpoint_id: z
        .string()
        .describe(
          "The ID of the webhook endpoint whose signing secret should be revealed."
        ),
    }),
  },
  tags: ["Webhooks"],
  summary: "Reveal a webhook endpoint signing secret",
  description:
    "Reveal the current outbound webhook signing secret for a webhook endpoint.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: RevealedWebhookSigningSecret,
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
                message: "Webhook endpoint not found.",
                hint: "The webhook endpoint with the given ID was not found.",
                docs: "https://kayle.id/docs/api/webhooks/endpoints#reveal-signing-secret",
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
