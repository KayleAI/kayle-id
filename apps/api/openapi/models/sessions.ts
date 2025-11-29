import { z } from "@hono/zod-openapi";

export const Session = z.object({
  id: z.string().describe("The ID of the verification session"),
});
