import { Hono } from "hono";

const events = new Hono<{ Bindings: CloudflareBindings }>();

export default events;
