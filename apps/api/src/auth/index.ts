import { server } from "@kayle-id/auth/server";
import { Hono } from "hono";

const auth = new Hono();

auth.on(["POST", "GET"], "/*", (c) => server.handler(c.req.raw));

export default auth;
