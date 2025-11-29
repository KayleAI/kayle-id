import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { WebhookEncryptionKey } from "@/openapi/models/webhook";

export const createWebhookEncryptionKey = createRoute({
  method: "post",
  path: "/:endpoint_id/keys",
  request: {
    params: z.object({
      endpoint_id: z
        .string()
        .describe(
          "The ID of the webhook endpoint to create the encryption key for (e.g. whe_live_...)."
        ),
    }),
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              key_id: z
                .string()
                .describe(
                  "The key identifier to use as `kid` in the JWE header."
                ),
              jwk: z
                .record(z.string(), z.unknown())
                .describe("The public JWK for encrypting webhook payloads."),
              algorithm: z
                .string()
                .describe('The JWE algorithm to use (e.g. "ECDH-ES").'),
              key_type: z.string().describe('The JWK key type (e.g. "EC").'),
            })
            .openapi("CreateWebhookEncryptionKeyRequest"),
        },
      },
    },
  },
  tags: ["Webhooks"],
  summary: "Create a webhook encryption key",
  description:
    "Register a new encryption key (JWK) for a webhook endpoint. The key will be used for encrypting webhook payloads.",
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
                docs: "https://kayle.id/docs/api/webhooks/keys#create",
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
                docs: "https://kayle.id/docs/api/webhooks/keys#create",
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
