import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { RotatedWebhookSigningSecret } from "@/openapi/models/webhook";

export const rotateWebhookEndpointSigningSecret = createRoute({
  method: "post",
  path: "/:endpoint_id/signing-secret/rotate",
  request: {
    params: z.object({
      endpoint_id: z
        .string()
        .describe(
          "The ID of the webhook endpoint whose signing secret should be rotated."
        ),
    }),
  },
  tags: ["Webhooks"],
  summary: "Rotate a webhook endpoint signing secret",
  description:
    "Rotate the outbound webhook signing secret for a webhook endpoint. The new plaintext secret is returned once.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: RotatedWebhookSigningSecret,
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
                docs: "https://kayle.id/docs/api/webhooks/endpoints#rotate-signing-secret",
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
