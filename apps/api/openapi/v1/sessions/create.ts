import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "openapi/base";
import { InternalServerErrorResponse } from "openapi/errors";
import { Session } from "openapi/models/sessions";

export const createSession = createRoute({
  method: "post",
  path: "/",
  request: {},
  tags: ["Sessions"],
  summary: "Create a new session",
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
    400: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "BAD_REQUEST",
                message: "Bad request.",
                hint: "The request is invalid.",
                docs: "https://kayle.id/docs/api/sessions#create",
              },
            },
          }),
        },
      },
      description: "Bad request.",
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
