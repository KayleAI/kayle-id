import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";

export const internalCreateApiKey = createRoute({
  // Hide this route in production as it's not needed for the public API.
  hide: process.env.NODE_ENV === "production",
  method: "post",
  path: "/",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().min(1),
            environment: z.enum(["live", "test"]).optional(),
            permissions: z.array(z.string()).optional(),
            metadata: z.record(z.string(), z.any()).optional(),
          }),
        },
      },
      required: true,
    },
  },
  tags: ["API Keys"],
  summary: "Create an API key",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              id: z.string(),
              key: z.string(),
            }),
            error: z.null(),
          }),
        },
      },
      description: "API key created successfully.",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponse,
        },
      },
      description: "Bad request.",
    },
    403: {
      content: {
        "application/json": {
          schema: ErrorResponse,
        },
      },
      description: "Forbidden.",
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
