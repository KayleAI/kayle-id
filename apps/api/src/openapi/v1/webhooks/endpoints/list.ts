import { createRoute, z } from "@hono/zod-openapi";
import {
  booleanQueryParam,
  ErrorResponseWithPagination,
  Pagination,
  paginationLimitQuery,
} from "@/openapi/base";
import { WebhookEndpoint } from "@/openapi/models/webhook";

export const listWebhookEndpoints = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      environment: z
        .enum(["live", "test"])
        .optional()
        .describe(
          "Filter webhook endpoints by environment. If omitted, endpoints from all environments are returned."
        ),
      enabled: booleanQueryParam.describe(
        "Filter webhook endpoints by enabled state. If omitted, both enabled and disabled endpoints are returned."
      ),
      limit: paginationLimitQuery.describe(
        "Maximum number of webhook endpoints to return. Defaults to 10 if not specified."
      ),
      starting_after: z
        .string()
        .optional()
        .describe(
          "Cursor of the last item from the previous page. When provided, the next page of results will be returned."
        ),
    }),
  },
  description: "List all webhook endpoints available in the organization",
  summary: "List webhook endpoints",
  tags: ["Webhooks"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(WebhookEndpoint),
            error: z.null(),
            pagination: Pagination,
          }),
        },
      },
      description:
        "Successful operation. Returns a list of webhook endpoints for the organization.",
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
