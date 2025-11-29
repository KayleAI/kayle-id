import { z } from "@hono/zod-openapi";

export const Pagination = z
  .object({
    total: z
      .number()
      .describe("The total number of items")
      .openapi({ example: 100 }),
    page: z
      .number()
      .describe("The current page number")
      .openapi({ example: 1 }),
    limit: z
      .number()
      .describe("The number of items per page")
      .openapi({ example: 10 }),
  })
  .openapi("Pagination");

export const PaginationError = z.object({
  total: z.literal(0),
  page: z.literal(1),
  limit: z.literal(10),
});

export const ErrorObject = z
  .object({
    code: z.string().describe("The error code"),
    message: z.string().describe("The error message"),
    hint: z.string().describe("A hint to help the user fix the error"),
    docs: z.string().describe("A link to the documentation for the error"),
  })
  .nullable();

export const ErrorResponse = z.object({
  data: z.null().describe("Empty data object."),
  error: ErrorObject.nonoptional(),
});

export const ErrorResponseWithPagination = ErrorResponse.extend({
  pagination: PaginationError.nonoptional(),
});
