import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";

export const internalDeleteApiKey = createRoute({
  method: "delete",
  path: "/{id}",
  request: {
    params: z.object({
      id: z.string().min(1),
    }),
  },
  tags: ["API Keys"],
  summary: "Delete an API key",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              status: z.literal("success"),
              message: z.string(),
            }),
            error: z.null(),
          }),
        },
      },
      description: "API key deleted successfully.",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponse,
        },
      },
      description: "Bad request.",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorResponse,
          example: {
            data: null,
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "An unexpected error occurred",
            },
          },
        },
      },
      description: "Internal server error.",
    },
  },
});
