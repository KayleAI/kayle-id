import { OpenAPIHono } from "@hono/zod-openapi";
import { internalCreateApiKey } from "openapi/api-keys/create";
import { createApiKey } from "@/functions/auth/create-api-key";

const createApiKeyRoute = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string };
}>();

createApiKeyRoute.openapi(internalCreateApiKey, async (c) => {
  const organizationId = c.get("organizationId");

  const { name, metadata, permissions } = c.req.valid("json");

  try {
    const { id, apiKey } = await createApiKey({
      name,
      organizationId,
      metadata,
      permissions,
    });

    return c.json(
      {
        data: {
          id,
          key: apiKey,
        } as const,
        error: null,
      },
      200
    );
  } catch {
    return c.json(
      {
        data: null,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
          hint: "Please try again in a few moments.",
          docs: "https://kayle.id/docs/api/errors#internal_server_error",
        } as const,
      },
      500
    );
  }
});

export { createApiKeyRoute };
