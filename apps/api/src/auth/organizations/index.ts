import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "@kayle-id/auth/server";
import { createMiddleware } from "hono/factory";
import { unauthorized } from "@/v1/auth";
import createOrganizationRoute from "./create";

const organizations = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

const organizationMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: {
    type: "api" | "session";
    organizationId?: string | null;
    userId?: string;
  };
}>(async (c, next) => {
  const response = await auth.api.getSession(c.req.raw);

  if (!response?.session) {
    return unauthorized(c);
  }

  c.set("type", "session");
  c.set("organizationId", response.session?.activeOrganizationId ?? null);
  c.set("userId", response.session?.userId);
  await next();
});

organizations.use(organizationMiddleware);

organizations.route("/", createOrganizationRoute);

export default organizations;
