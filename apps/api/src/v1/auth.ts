import { auth } from "@kayle-id/auth/server";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { api_keys } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createHMAC } from "@/functions/hmac";

const sessionMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: {
    type: "api" | "session";
    organizationId?: string;
    userId?: string;
  };
}>(async (c, next) => {
  const response = await auth.api.getSession(c.req.raw);

  if (!response?.session) {
    return unauthorized(c);
  }

  if (!response.session?.activeOrganizationId) {
    return forbidden(c);
  }

  c.set("type", "session");
  c.set("organizationId", response.session?.activeOrganizationId);
  c.set("userId", response.session?.userId);
  await next();
});

const authenticate = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: {
    environment: "live" | "test" | "either";
    type: "api" | "session";
    organizationId?: string;
  };
}>(async (c, next) => {
  const headers = new Headers(c.req.raw.headers);
  const authorization = headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    const apiKey = authorization.split(" ")[1];
    const keyHash = await createHMAC(apiKey, {
      algorithm: "SHA256",
      secret: env.AUTH_SECRET,
    });
    const [
      { organizationId, environment } = {
        organizationId: null,
        environment: "live",
      },
    ] = await db
      .select({
        organizationId: api_keys.organizationId,
        environment: api_keys.environment,
      })
      .from(api_keys)
      .where(eq(api_keys.keyHash, keyHash))
      .limit(1);

    if (!organizationId) {
      return unauthorized(c);
    }

    c.set("type", "api");
    c.set("environment", environment);
    c.set("organizationId", organizationId);

    return await next();
  }

  // attempt to verify user session
  const response = await auth.api.getSession(c.req.raw);

  if (!response?.session) {
    return unauthorized(c);
  }

  if (!response.session?.activeOrganizationId) {
    return forbidden(c);
  }

  c.set("type", "session");
  c.set("environment", "either");
  c.set("organizationId", response.session?.activeOrganizationId);
  await next();
});

export function unauthorized(c: Context) {
  return c.json(
    { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
    401
  );
}

export function forbidden(c: Context) {
  return c.json({ error: { code: "FORBIDDEN", message: "Forbidden" } }, 403);
}

export { authenticate, sessionMiddleware };
