import { createRoute, z } from "@hono/zod-openapi";
import { Pagination } from "@/openapi/base";
import { InternalServerErrorWithPaginationResponse } from "@/openapi/errors";
import { Session } from "@/openapi/models/sessions";

export const listSessions = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      status: z
        .enum(["created", "in_progress", "completed", "expired", "cancelled"])
        .optional()
        .describe("Filter sessions by status."),
      created_from: z
        .string()
        .datetime()
        .optional()
        .describe(
          "Return sessions created at or after this ISO 8601 timestamp."
        ),
      created_to: z
        .string()
        .datetime()
        .optional()
        .describe(
          "Return sessions created at or before this ISO 8601 timestamp."
        ),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Maximum number of sessions to return. Defaults to 10 if not specified."
        ),
      starting_after: z
        .string()
        .optional()
        .describe(
          "Cursor of the last item from the previous page. When provided, the next page of results will be returned."
        ),
      include_attempts: z.coerce
        .boolean()
        .optional()
        .describe(
          "When true, includes the `attempts` array for each session. When false or omitted, attempts are not returned."
        ),
    }),
  },
  tags: ["Sessions"],
  summary: "List all sessions",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(Session),
            error: z.null(),
            pagination: Pagination,
          }),
        },
      },
      description:
        "Successful operation. Returns a list of verification sessions for the organization.",
    },
    500: {
      content: {
        "application/json": {
          schema: InternalServerErrorWithPaginationResponse,
        },
      },
      description: "Internal server error.",
    },
  },
});
