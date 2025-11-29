import { OpenAPIHono } from "@hono/zod-openapi";
import { authenticate } from "./auth";
import sessions from "./sessions";
import sessionAttempts from "./sessions/attempts";
import webhooks from "./webhooks";
import events from "./webhooks/events";

const v1 = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

// All v1 routes require authentication
v1.use(authenticate);

// v1 routes
v1.route("/events", events);
v1.route("/sessions", sessions);
v1.route("/sessions/attempts", sessionAttempts);
v1.route("/webhooks", webhooks);

export default v1;
