import { OpenAPIHono } from "@hono/zod-openapi";
import { listWebhookDeliveries } from "openapi/v1/webhooks/deliveries/list";

const webhookDeliveries = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

webhookDeliveries.openapi(listWebhookDeliveries, (c) => {
  // TODO: GET /v1/webhooks/deliveries — List all webhook deliveries for the organization
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

export default webhookDeliveries;
