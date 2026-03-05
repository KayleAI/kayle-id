import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";
import { RequestedShareField, Session } from "@/openapi/models/sessions";

export const createSession = createRoute({
  method: "post",
  path: "/",
  request: {
    query: z.object({
      include_attempts: z.coerce
        .boolean()
        .optional()
        .describe(
          "When true, includes the `attempts` array on the created session. Attempts will be empty on creation."
        ),
    }),
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              redirect_url: z
                .string()
                .url()
                .optional()
                .describe(
                  "Optional URL to redirect the user to after the verification session is completed."
                ),
              share_fields: z
                .record(z.string(), RequestedShareField)
                .optional()
                .describe(
                  "Optional map of requested share fields keyed by claim key. Each entry must include `required` (boolean) and `reason` (non-empty string, max 200)."
                ),
            })
            .openapi("CreateSessionRequest"),
        },
      },
      required: false,
    },
  },
  tags: ["Sessions"],
  summary: "Create a new verification session",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: Session,
            error: z.null(),
          }),
        },
      },
      description:
        "Successful operation. Returns the newly created verification session.",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "UNKNOWN_CLAIM_KEY",
                message: "Unknown claim key.",
                hint: "Use a supported claim key from the share contract allowlist.",
                docs: "https://kayle.id/docs/api/sessions#create",
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
