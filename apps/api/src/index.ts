import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { config } from "@/config";
import v1 from "@/v1";
import verify from "@/v1/verify";
import { processDueWebhookDeliveries } from "@/v1/webhooks/deliveries/service";
import auth from "./auth";

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

app.use(
  cors({
    origin: [
      process.env.NODE_ENV === "production"
        ? "https://kayle.id"
        : "https://localhost:3000",
    ],
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

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
app.route("/v1/auth", auth);

// v1
app.route("/v1/verify", verify);
app.route("/v1", v1);

// R2 Emulation — Only for development & testing
if (process.env.NODE_ENV !== "production") {
  app.get("/r2/*", async (c) => {
    const key = c.req.path.substring("/r2/".length);
    const file = await c.env.STORAGE.get(key);

    if (!file) {
      return c.json(
        {
          error: "file not found",
          status: 404,
        },
        404
      );
    }

    const headers = new Headers();
    headers.append("etag", file.httpEtag);

    return new Response(file.body, {
      headers,
    });
  });
}

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
          : "http://127.0.0.1:8787",
      description: "",
    },
  ],
  security: [{ bearerAuth: [] }],
  openapi: "3.0.0",
});

app.get("/reference", Scalar({ url: "/openapi" }));

const worker = Object.assign(app, {
  fetch: app.fetch.bind(app),
  scheduled: async (
    _controller: ScheduledController,
    env: CloudflareBindings,
    _executionCtx: ExecutionContext
  ) => {
    await processDueWebhookDeliveries({
      authSecret: env.AUTH_SECRET,
    });
  },
});

export default worker;
