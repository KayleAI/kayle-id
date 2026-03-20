import { OpenAPIHono } from "@hono/zod-openapi";
import { getEventById } from "./get-by-id";
import { listEvents } from "./list";
import { replayEvent } from "./replay";

const webhookEvents = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string };
}>();

webhookEvents.route("/", getEventById);
webhookEvents.route("/", listEvents);
webhookEvents.route("/", replayEvent);

export default webhookEvents;
