import { OpenAPIHono } from "@hono/zod-openapi";
import { internalUpdateApiKey } from "openapi/api-keys/update";
import { checkPermission } from "@/functions/auth/check-permission";
import { updateApiKey } from "@/functions/auth/update-api-key";

const updateApiKeyRoute = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string; userId: string };
}>();

updateApiKeyRoute.openapi(internalUpdateApiKey, async (c) => {
  const organizationId = c.get("organizationId");

  const { id } = c.req.valid("param");
  const { name, enabled, metadata, permissions } = c.req.valid("json");

  try {
    // ensure the user has permission to update API keys
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
            message: "You are not authorized to update API keys",
            hint: "Please contact an administrator to request access.",
            docs: "https://kayle.id/docs/api/errors#forbidden",
          } as const,
        },
        403
      );
    }

    const { status, message } = await updateApiKey(id, organizationId, {
      name,
      enabled,
      metadata,
      permissions,
    });

    if (status === "error") {
      return c.json(
        {
          data: null,
          error: {
            code: "API_KEY_NOT_FOUND",
            message: message ?? "API key not found",
            hint: "Confirm the API key ID belongs to this organization.",
            docs: "https://kayle.id/docs/api/errors#api_key_not_found",
          } as const,
        },
        400
      );
    }

    return c.json(
      {
        data: {
          status,
          message: "API key updated successfully",
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

export { updateApiKeyRoute };
