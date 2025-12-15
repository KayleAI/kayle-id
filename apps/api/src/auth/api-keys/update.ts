import { OpenAPIHono } from "@hono/zod-openapi";
import { internalUpdateApiKey } from "openapi/api-keys/update";
import { updateApiKey } from "@/functions/auth/update-api-key";

const updateApiKeyRoute = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string };
}>();

updateApiKeyRoute.openapi(internalUpdateApiKey, async (c) => {
  const organizationId = c.get("organizationId");

  const { id } = c.req.valid("param");
  const { name, enabled, metadata, permissions } = c.req.valid("json");

  try {
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
