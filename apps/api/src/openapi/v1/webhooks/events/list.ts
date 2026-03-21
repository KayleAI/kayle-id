import { createRoute, z } from "@hono/zod-openapi";
import {
  ErrorResponseWithPagination,
  Pagination,
  paginationLimitQuery,
} from "@/openapi/base";
import { WebhookEvent } from "@/openapi/models/webhook";

export const listWebhookEvents = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      environment: z
        .enum(["live", "test"])
        .optional()
        .describe(
          "Filter events by environment. If omitted, events from all environments are returned."
        ),
      type: z
        .string()
        .optional()
        .describe(
          'Filter events by type (e.g. "verification.attempt.succeeded").'
        ),
      created_from: z
        .string()
        .datetime()
        .optional()
        .describe("Return events created at or after this ISO 8601 timestamp."),
      created_to: z
        .string()
        .datetime()
        .optional()
        .describe(
          "Return events created at or before this ISO 8601 timestamp."
        ),
      limit: paginationLimitQuery.describe(
        "Maximum number of events to return. Defaults to 10 if not specified."
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
  summary: "List webhook events",
  description:
    "List logical events generated for the organization, including delivery summaries.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(WebhookEvent),
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
