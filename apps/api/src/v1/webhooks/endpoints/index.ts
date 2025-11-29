import { OpenAPIHono } from "@hono/zod-openapi";
import { endpointById } from "./get-by-id";
import { endpointKeys } from "./keys";
import { listAndCreateEndpoints } from "./list";
import { updateEndpoint } from "./update";

const webhookEndpoints = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

webhookEndpoints.route("/", listAndCreateEndpoints);
webhookEndpoints.route("/:endpoint_id", endpointById);
webhookEndpoints.route("/:endpoint_id", updateEndpoint);
webhookEndpoints.route("/:endpoint_id/keys", endpointKeys);

export default webhookEndpoints;
