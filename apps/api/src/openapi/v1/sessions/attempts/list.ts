import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponseWithPagination, Pagination } from "@/openapi/base";
import { Attempt } from "@/openapi/models/sessions";

export const listSessionAttempts = createRoute({
  method: "get",
  path: "/attempts",
  request: {
    query: z.object({
      session_id: z
        .string()
        .optional()
        .describe(
          "Filter attempts by verification session ID (e.g. vs_live_...)."
        ),
      status: z
        .enum(["in_progress", "succeeded", "failed", "cancelled"])
        .optional()
        .describe("Filter attempts by status."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Maximum number of attempts to return. Defaults to 10 if not specified."
        ),
      starting_after: z
        .string()
        .optional()
        .describe(
          "Cursor of the last item from the previous page. When provided, the next page of results will be returned."
        ),
    }),
  },
  tags: ["Sessions"],
  summary: "List verification attempts",
  description:
    "List verification attempts for the authenticated organization, optionally filtered by session and status.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(Attempt),
            error: z.null(),
            pagination: Pagination,
          }),
        },
      },
      description: "Successful operation.",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseWithPagination.openapi({
            example: {
              data: null,
              error: {
                code: "BAD_REQUEST",
                message: "Bad request.",
                hint: "You must provide at least one filter: `session_id` or `status`.",
                docs: "https://kayle.id/docs/api/sessions/attempts",
              },
              pagination: {
                limit: 10,
                has_more: false,
                next_cursor: null,
              },
            },
          }),
        },
      },
      description: "Bad request.",
    },
  },
});
