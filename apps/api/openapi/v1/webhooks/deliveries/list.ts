import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponseWithPagination, Pagination } from "openapi/base";
import { WebhookDelivery } from "openapi/models/webhook";

export const listWebhookDeliveries = createRoute({
  method: "get",
  path: "/",
  request: {},
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
      description: "Retrieve the webhook deliveries",
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
              total: 0,
              page: 1,
              limit: 10,
            },
          },
        },
      },
      description: "Internal server error.",
    },
  },
});
