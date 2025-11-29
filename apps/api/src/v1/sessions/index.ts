import { OpenAPIHono } from "@hono/zod-openapi";
import { cancelSession } from "openapi/v1/sessions/cancel-by-id";
import { createSession } from "openapi/v1/sessions/create";
import { getSession } from "openapi/v1/sessions/get-by-id";
import { listSessions } from "openapi/v1/sessions/list";

const sessions = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

sessions.openapi(listSessions, (c) => {
  // TODO: GET /v1/sessions — List all verification sessions for the organization
  return c.json(
    {
      data: [],
      error: null,
      pagination: {
        total: 0,
        page: 1,
        limit: 10,
      },
    },
    200
  );
});

sessions.openapi(createSession, (c) => {
  // TODO: POST /v1/sessions — Create a new verification session
  return c.json(
    {
      data: {
        id: "123",
      },
      error: null,
    },
    200
  );
});

sessions.openapi(getSession, (c) => {
  // TODO: GET /v1/sessions/:id — Get a verification session
  return c.json(
    {
      data: {
        id: "123",
      },
      error: null,
    },
    200
  );
});

sessions.openapi(cancelSession, (c) => {
  // TODO: POST /v1/sessions/:id/cancel — Cancel a verification session
  return c.body(null, 204);
});

export default sessions;
