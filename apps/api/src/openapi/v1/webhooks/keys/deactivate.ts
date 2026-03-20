import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookEncryptionKey } from "@/openapi/models/webhook";

export const deactivateWebhookEncryptionKey = createRoute({
  method: "post",
  path: "/:key_id/deactivate",
  request: {
    params: z.object({
      key_id: z
        .string()
        .describe(
          "The ID of the webhook encryption key to deactivate (e.g. whk_live_...)."
        ),
    }),
  },
  tags: ["Webhooks"],
  summary: "Deactivate a webhook encryption key",
  description:
    "Deactivate an encryption key. Existing deliveries remain valid; new deliveries will not use this key.",
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
      description: "Webhook encryption key deactivated.",
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
                docs: "https://kayle.id/docs/api/webhooks/keys#deactivate",
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
