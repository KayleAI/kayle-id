import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponseWithPagination, Pagination } from "openapi/base";
import { WebhookEndpoint } from "openapi/models/webhook";

export const listWebhookEndpoints = createRoute({
  method: "get",
  path: "/",
  request: {},
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
