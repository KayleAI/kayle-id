import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";

export const internalCreateOrganization = createRoute({
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
            slug: z.string().min(1),
            logo: z
              .object({
                data: z.string(), // base64 string
                contentType: z.string(), // MIME type
              })
              .optional(),
          }),
        },
      },
      required: true,
    },
  },
  tags: ["Organizations"],
  summary: "Create an organization",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              id: z.string(),
            }),
            error: z.null(),
          }),
        },
      },
      description: "Organization created successfully.",
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
