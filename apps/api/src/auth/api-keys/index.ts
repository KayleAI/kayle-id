import { OpenAPIHono } from "@hono/zod-openapi";
import { createApiKeyRoute } from "./create";
import { deleteApiKeyRoute } from "./delete";
import { listApiKeys } from "./list";
import { updateApiKeyRoute } from "./update";

const apiKeys = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

apiKeys.route("/", listApiKeys);
apiKeys.route("/", createApiKeyRoute);
apiKeys.route("/:id", updateApiKeyRoute);
apiKeys.route("/:id", deleteApiKeyRoute);

export default apiKeys;
