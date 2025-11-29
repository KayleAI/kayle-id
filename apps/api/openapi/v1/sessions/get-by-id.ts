import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "openapi/base";
import { InternalServerErrorResponse } from "openapi/errors";
import { Session } from "openapi/models/sessions";

export const getSession = createRoute({
  method: "get",
  path: "/:id",
  request: {},
  tags: ["Sessions"],
  summary: "Get a session by ID",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: Session,
            error: z.null(),
          }),
        },
      },
      description: "Successful operation.",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Session not found.",
                hint: "The session with the given ID was not found.",
                docs: "https://kayle.id/docs/api/sessions#get-by-id",
              },
            },
          }),
        },
      },
      description: "Session not found.",
    },
    500: {
      content: {
        "application/json": {
          schema: InternalServerErrorResponse,
        },
      },
      description: "Internal server error.",
    },
  },
});
