import { z } from "@hono/zod-openapi";

export const booleanQueryParam = z
  .preprocess((value) => {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }

    return value;
  }, z.boolean())
  .optional();

export const paginationLimitQuery = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .optional();

export const Pagination = z
  .object({
    /**
     * The maximum number of items that can be returned in this page.
     */
    limit: z
      .number()
      .describe("The maximum number of items returned.")
      .openapi({ example: 10 }),
    /**
     * Whether there are more items available after this page.
     */
    has_more: z
      .boolean()
      .describe("Whether there are more items available after this page.")
      .openapi({ example: false }),
    /**
     * A cursor that can be used as `starting_after` to fetch the next page.
     */
    next_cursor: z
      .string()
      .nullable()
      .describe(
        "Cursor to use as `starting_after` to fetch the next page of results, or null if there are no more items."
      )
      .openapi({ example: null }),
  })
  .openapi("Pagination");

export const PaginationError = z.object({
  limit: z.number(),
  has_more: z.literal(false),
  next_cursor: z.null(),
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
