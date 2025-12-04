import { OpenAPIHono } from "@hono/zod-openapi";
import { server } from "@kayle-id/auth/server";
import { Scalar } from "@scalar/hono-api-reference";
import apiKeys from "./auth/api-keys";
import { config } from "./config";
import v1 from "./v1";
import verify from "./verify";

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

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

// Auth Handlers
app.on(["POST", "GET"], "/v1/auth/*", (c) => server.handler(c.req.raw));
app.route("/v1/auth/api-keys", apiKeys);

// v1
app.route("/v1", v1);
app.route("/verify", verify);

// OpenAPI documentation
app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
});

app.doc("/openapi", {
  info: {
    title: "Kayle ID",
    version: config.version,
    description: "Privacy-first identity verification.",
    license: {
      name: "Apache License 2.0",
      url: "https://github.com/kayleai/kayle-id/blob/main/LICENSE",
    },
    contact: {
      name: "Kayle ID",
      url: "https://kayle.id",
      email: "help@kayle.id",
    },
    termsOfService: "https://kayle.id/terms",
  },
  servers: [
    {
      url:
        process.env.NODE_ENV === "production"
          ? "https://api.kayle.id"
          : "http://localhost:8787",
      description: "",
    },
  ],
  security: [{ bearerAuth: [] }],
  openapi: "3.0.0",
});

app.get("/reference", Scalar({ url: "/openapi" }));

export default {
  fetch: app.fetch,
};
