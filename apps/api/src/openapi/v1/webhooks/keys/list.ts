import { createRoute, z } from "@hono/zod-openapi";
import {
  booleanQueryParam,
  ErrorResponseWithPagination,
  Pagination,
  paginationLimitQuery,
} from "@/openapi/base";
import { WebhookEncryptionKey } from "@/openapi/models/webhook";

export const listWebhookEncryptionKeys = createRoute({
  method: "get",
  path: "/:endpoint_id/keys",
  request: {
    params: z.object({
      endpoint_id: z
        .string()
        .describe(
          "The ID of the webhook endpoint whose keys should be listed (e.g. whe_live_...)."
        ),
    }),
    query: z.object({
      is_active: booleanQueryParam.describe(
        "Filter keys by active state. If omitted, both active and inactive keys are returned."
      ),
      limit: paginationLimitQuery.describe(
        "Maximum number of keys to return. Defaults to 10 if not specified."
      ),
      starting_after: z
        .string()
        .optional()
        .describe(
          "Cursor of the last item from the previous page. When provided, the next page of results will be returned."
        ),
    }),
  },
  tags: ["Webhooks"],
  summary: "List webhook encryption keys",
  description:
    "List encryption keys registered for a webhook endpoint belonging to the authenticated organization.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(WebhookEncryptionKey),
            error: z.null(),
            pagination: Pagination,
          }),
        },
      },
      description: "Successful operation.",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorResponseWithPagination,
        },
      },
      description: "Internal server error.",
    },
  },
});
