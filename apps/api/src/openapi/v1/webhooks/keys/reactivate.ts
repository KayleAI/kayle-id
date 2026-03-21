import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookEncryptionKey } from "@/openapi/models/webhook";

export const reactivateWebhookEncryptionKey = createRoute({
  method: "post",
  path: "/:key_id/reactivate",
  request: {
    params: z.object({
      key_id: z
        .string()
        .describe(
          "The ID of the webhook encryption key to reactivate (e.g. whk_live_...)."
        ),
    }),
  },
  tags: ["Webhooks"],
  summary: "Reactivate a webhook encryption key",
  description:
    "Reactivate an encryption key so it can be used for new webhook deliveries again.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: WebhookEncryptionKey,
            error: z.null(),
          }),
        },
      },
      description: "Webhook encryption key reactivated.",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Webhook encryption key not found.",
                hint: "The webhook encryption key with the given ID was not found.",
                docs: "https://kayle.id/docs/api/webhooks/keys#reactivate",
              },
            },
          }),
        },
      },
      description: "Webhook encryption key not found.",
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
