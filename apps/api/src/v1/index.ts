import { OpenAPIHono } from "@hono/zod-openapi";
import { authenticate } from "@/v1/auth";
import sessions from "@/v1/sessions";
import sessionAttempts from "@/v1/sessions/attempts";
import webhooks from "@/v1/webhooks";
import events from "@/v1/webhooks/events";

const v1 = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

// All v1 routes require authentication
v1.use(authenticate);

// v1 routes
v1.route("/events", events);
v1.route("/sessions", sessions);
v1.route("/sessions/attempts", sessionAttempts);
v1.route("/webhooks", webhooks);

export default v1;
