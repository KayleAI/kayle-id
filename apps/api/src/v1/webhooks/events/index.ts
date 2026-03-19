import { OpenAPIHono } from "@hono/zod-openapi";
import { getEventById } from "./get-by-id";
import { listEvents } from "./list";

const webhookEvents = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string };
}>();

webhookEvents.route("/", getEventById);
webhookEvents.route("/", listEvents);

export default webhookEvents;
