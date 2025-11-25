import { server } from "@kayle-id/auth/server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  //
  return c.json({
    data: {
      message: "Hello from Kayle ID!",
      docs: "https://docs.kayle.id",
    },
    error: null,
  });
});

// Auth API
app.on(["POST", "GET"], "/v1/auth/*", (c) => server.handler(c.req.raw));

export default app;
