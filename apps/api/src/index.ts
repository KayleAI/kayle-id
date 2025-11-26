import { server } from "@kayle-id/auth/server";
import { Hono } from "hono";
import events from "./v1/events";
import sessions from "./v1/sessions";
import verifications from "./v1/verifications";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", (c) => {
  const status: "healthy" | "unhealthy" = "healthy";

  return c.json({
    data: {
      message: "Hello from Kayle ID!",
      docs: "https://docs.kayle.id",
      status,
    },
    error: null,
  });
});

// Auth API
app.on(["POST", "GET"], "/v1/auth/*", (c) => server.handler(c.req.raw));

// v1 API
app.route("/v1/events", events);
app.route("/v1/sessions", sessions);
app.route("/v1/verifications", verifications);

export default app;
