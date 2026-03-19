import { OpenAPIHono } from "@hono/zod-openapi";
import { endpointById } from "./get-by-id";
import { endpointKeys } from "./keys";
import { listAndCreateEndpoints } from "./list";
import { revealSigningSecretEndpoint } from "./reveal-signing-secret";
import { rotateSigningSecretEndpoint } from "./rotate-signing-secret";
import { updateEndpoint } from "./update";

const webhookEndpoints = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

webhookEndpoints.route("/", listAndCreateEndpoints);
webhookEndpoints.route("/", endpointKeys);
webhookEndpoints.route("/", revealSigningSecretEndpoint);
webhookEndpoints.route("/", rotateSigningSecretEndpoint);
webhookEndpoints.route("/", endpointById);
webhookEndpoints.route("/", updateEndpoint);

export default webhookEndpoints;
