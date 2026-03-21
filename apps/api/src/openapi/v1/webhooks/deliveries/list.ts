import { createRoute, z } from "@hono/zod-openapi";
import {
  ErrorResponseWithPagination,
  Pagination,
  paginationLimitQuery,
} from "@/openapi/base";
import { WebhookDelivery } from "@/openapi/models/webhook";

export const listWebhookDeliveries = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      status: z
        .enum(["pending", "delivering", "succeeded", "failed"])
        .optional()
        .describe("Filter webhook deliveries by status."),
      endpoint_id: z
        .string()
        .optional()
        .describe("Filter webhook deliveries by webhook endpoint ID."),
      event_id: z
        .string()
        .optional()
        .describe("Filter webhook deliveries by event ID."),
      limit: paginationLimitQuery.describe(
        "Maximum number of webhook deliveries to return. Defaults to 10 if not specified."
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
  summary: "List webhook deliveries",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(WebhookDelivery),
            error: z.null(),
            pagination: Pagination,
          }),
        },
      },
      description:
        "Retrieve webhook deliveries for the organization with optional filters and cursor-based pagination.",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorResponseWithPagination,
          example: {
            data: null,
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "An unexpected error occurred",
              hint: "Please try again later",
              docs: "https://docs.kayle.id/errors/internal-server-error",
            },
            pagination: {
              limit: 10,
              has_more: false,
              next_cursor: null,
            },
          },
        },
      },
      description: "Internal server error.",
    },
  },
});
