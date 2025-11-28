import { db } from "@kayle-id/database/drizzle";
import { api_keys } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { authenticate } from "@/v1/auth";

const apiKeys = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string; type: "api" | "session" };
}>();

apiKeys.use(authenticate);

apiKeys.get("/", async (c) => {
  const type = c.get("type");

  if (type === "api") {
    return forbidden(c);
  }

  const organizationId = c.get("organizationId");

  const [data] = await db
    .select({
      id: api_keys.id,
      name: api_keys.name,
      enabled: api_keys.enabled,
      permissions: api_keys.permissions,
      metadata: api_keys.metadata,
      createdAt: api_keys.createdAt,
      updatedAt: api_keys.updatedAt,
      requestCount: api_keys.requestCount,
    })
    .from(api_keys)
    .where(eq(api_keys.organizationId, organizationId));

  if (!data) {
    return c.json({
      data: [],
      error: null,
    });
  }

  return c.json({
    data,
    error: null,
  });
});

function forbidden(c: Context) {
  return c.json(
    {
      error: {
        code: "FORBIDDEN",
        message: "You're not allowed to access this resource using an API key.",
      },
    },
    403
  );
}

export default apiKeys;
