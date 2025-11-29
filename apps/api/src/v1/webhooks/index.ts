import { OpenAPIHono } from "@hono/zod-openapi";

import webhookDeliveries from "./deliveries";
import webhookEndpoints from "./endpoints";
import webhookEncryptionKeys from "./keys";

const webhooks = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

webhooks.route("/deliveries", webhookDeliveries);
webhooks.route("/endpoints", webhookEndpoints);
webhooks.route("/keys", webhookEncryptionKeys);

export default webhooks;
