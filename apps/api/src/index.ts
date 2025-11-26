import { server } from "@kayle-id/auth/server";
import { Hono } from "hono";
import apiKeys from "./auth/api-keys";
import v1 from "./v1";

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

app.route("/v1/auth/api-keys", apiKeys);

// Auth API
app.on(["POST", "GET"], "/v1/auth/*", (c) => server.handler(c.req.raw));

// v1
app.route("/v1", v1);

export default app;
