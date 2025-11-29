import { OpenAPIHono } from "@hono/zod-openapi";
import { listWebhookEndpoints } from "openapi/v1/webhooks/endpoints/list";

const webhookEndpoints = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

webhookEndpoints.openapi(listWebhookEndpoints, (c) => {
  // TODO: GET /v1/webhooks/endpoints — List all webhook endpoints for the organization
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

export default webhookEndpoints;
