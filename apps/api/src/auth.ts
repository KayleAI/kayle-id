import { OpenAPIHono } from "@hono/zod-openapi";
import { server } from "@kayle-id/auth/server";
import apiKeys from "@/auth/api-keys";

const auth = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

// Auth Handlers
auth.route("/api-keys", apiKeys);
auth.on(["POST", "GET"], "/*", (c) => server.handler(c.req.raw));

export default auth;
