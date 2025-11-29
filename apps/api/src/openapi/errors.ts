import { z } from "@hono/zod-openapi";
import { PaginationError } from "./base";

export const InternalServerError = z.object({
  code: z.literal("INTERNAL_SERVER_ERROR"),
  message: z.literal("Internal server error."),
  hint: z.literal("The server encountered an error."),
  docs: z.literal("https://kayle.id/docs/api/errors"),
});

export const InternalServerErrorResponse = z.object({
  data: z.null(),
  error: InternalServerError,
});

export const InternalServerErrorWithPaginationResponse =
  InternalServerErrorResponse.extend({ pagination: PaginationError });
