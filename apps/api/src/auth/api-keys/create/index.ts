import { OpenAPIHono } from "@hono/zod-openapi";
import { checkPermission } from "@/functions/auth/check-permission";
import { createApiKey } from "@/functions/auth/create-api-key";
import { internalCreateApiKey } from "./openapi";

const createApiKeyRoute = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string; userId: string };
}>();

createApiKeyRoute.openapi(internalCreateApiKey, async (c) => {
  const organizationId = c.get("organizationId");

  const { name, metadata, permissions } = c.req.valid("json");

  try {
    // ensure the user has permission to create API keys
    const hasPermission = await checkPermission(
      c.get("userId"),
      organizationId
    );

    if (!hasPermission) {
      return c.json(
        {
          data: null,
          error: {
            code: "FORBIDDEN",
            message: "You are not authorized to create API keys",
            hint: "Please contact an administrator to request access.",
            docs: "https://kayle.id/docs/api/errors#forbidden",
          } as const,
        },
        403
      );
    }

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
