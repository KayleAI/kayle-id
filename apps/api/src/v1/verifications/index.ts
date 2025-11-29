import { OpenAPIHono } from "@hono/zod-openapi";

const verifications = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

verifications.get("/", (c) => {
  // TODO: GET /v1/verifications — List all verification attempts for the organization
  return c.json(
    {
      data: [],
      error: null,
    },
    200
  );
});

export default verifications;
