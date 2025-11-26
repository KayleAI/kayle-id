import { Hono } from "hono";

const verifications = new Hono<{ Bindings: CloudflareBindings }>();

export default verifications;
