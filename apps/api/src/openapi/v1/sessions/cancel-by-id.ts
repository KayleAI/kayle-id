import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";

export const cancelSession = createRoute({
  method: "post",
  path: "/:id/cancel",
  request: {
    params: z.object({
      id: z
        .string()
        .describe(
          "The ID of the verification session to cancel (e.g. vs_live_...)."
        ),
    }),
  },
  tags: ["Sessions"],
  summary: "Cancel a session",
  security: [{ bearerAuth: [] }],
  responses: {
    204: {
      description: "Session cancelled.",
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
                docs: "https://kayle.id/docs/api/sessions#cancel-by-id",
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
