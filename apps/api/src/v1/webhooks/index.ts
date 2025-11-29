import { OpenAPIHono } from "@hono/zod-openapi";

import webhookDeliveries from "./deliveries";
import webhookEndpoints from "./endpoints";
import webhookEvents from "./events";
import webhookKeys from "./keys";

const webhooks = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

webhooks.route("/deliveries", webhookDeliveries);
webhooks.route("/endpoints", webhookEndpoints);
webhooks.route("/events", webhookEvents);
webhooks.route("/keys", webhookKeys);

export default webhooks;
