import { OpenAPIHono } from "@hono/zod-openapi";
import { authenticate } from "./auth";
import events from "./events";
import sessions from "./sessions";
import verifications from "./verifications";
import webhooks from "./webhooks";

const v1 = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

// All v1 routes require authentication
v1.use(authenticate);

// v1 routes
v1.route("/events", events);
v1.route("/sessions", sessions);
v1.route("/verifications", verifications);
v1.route("/webhooks", webhooks);

export default v1;
