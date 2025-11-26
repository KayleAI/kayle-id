import { Hono } from "hono";
import { authenticate } from "./auth";
import events from "./events";
import sessions from "./sessions";
import verifications from "./verifications";

const v1 = new Hono<{ Bindings: CloudflareBindings }>();

// All v1 routes require authentication
v1.use(authenticate);

// v1 routes
v1.route("/events", events);
v1.route("/sessions", sessions);
v1.route("/verifications", verifications);

export default v1;
