import { createRoute, z } from "@hono/zod-openapi";
import { Pagination } from "openapi/base";
import { InternalServerErrorWithPaginationResponse } from "openapi/errors";
import { Session } from "openapi/models/sessions";

export const listSessions = createRoute({
  method: "get",
  path: "/",
  request: {},
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
      description: "Successful operation.",
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
