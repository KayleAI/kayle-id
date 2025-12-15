import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponseWithPagination, Pagination } from "@/openapi/base";

export const internalListApiKeys = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          "Maximum number of API keys to return. Defaults to 10 if not specified."
        ),
      starting_after: z
        .string()
        .optional()
        .describe(
          "Cursor of the last item from the previous page. When provided, the next page of results will be returned."
        ),
    }),
  },
  tags: ["API Keys"],
  summary: "List API keys",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                enabled: z.boolean(),
                permissions: z.array(z.string()),
                metadata: z.record(z.string(), z.any()),
                createdAt: z.date(),
                updatedAt: z.date(),
                requestCount: z.number(),
              })
            ),
            error: z.null(),
            pagination: Pagination,
          }),
        },
      },
      description: "Retrieve API keys.",
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
