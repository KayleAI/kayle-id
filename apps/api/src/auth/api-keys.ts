import { db } from "@kayle-id/database/drizzle";
import { core_api_keys } from "@kayle-id/database/schema/core";
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
      id: core_api_keys.id,
      name: core_api_keys.name,
      enabled: core_api_keys.enabled,
      permissions: core_api_keys.permissions,
      metadata: core_api_keys.metadata,
      createdAt: core_api_keys.createdAt,
      updatedAt: core_api_keys.updatedAt,
      requestCount: core_api_keys.requestCount,
    })
    .from(core_api_keys)
    .where(eq(core_api_keys.organizationId, organizationId));

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
