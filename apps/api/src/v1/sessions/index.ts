import { Hono } from "hono";

const sessions = new Hono<{ Bindings: CloudflareBindings }>();

export default sessions;
