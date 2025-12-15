import { OpenAPIHono } from "@hono/zod-openapi";
import { internalDeleteApiKey } from "openapi/api-keys/delete";
import { checkPermission } from "@/functions/auth/check-permission";
import { deleteApiKey } from "@/functions/auth/delete-api-key";

const deleteApiKeyRoute = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string; userId: string };
}>();

deleteApiKeyRoute.openapi(internalDeleteApiKey, async (c) => {
  const organizationId = c.get("organizationId");

  const { id } = c.req.valid("param");

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

    const { status, message } = await deleteApiKey(id, organizationId);

    if (status === "error") {
      return c.json(
        {
          data: null,
          error: {
            code: "API_KEY_NOT_DELETED",
            message: message ?? "API key not deleted",
            hint: "Confirm the API key ID belongs to this organization.",
            docs: "https://kayle.id/docs/api/errors#api_key_not_deleted",
          } as const,
        },
        400
      );
    }

    return c.json(
      {
        data: {
          status,
          message: "API key deleted successfully",
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

export { deleteApiKeyRoute };
