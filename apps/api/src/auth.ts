import { OpenAPIHono } from "@hono/zod-openapi";
import { server } from "@kayle-id/auth/server";
import apiKeys from "@/auth/api-keys";

const auth = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

// Auth Handlers
auth.on(["POST", "GET"], "/v1/auth/*", (c) => server.handler(c.req.raw));
auth.route("/v1/auth/api-keys", apiKeys);

export default auth;
