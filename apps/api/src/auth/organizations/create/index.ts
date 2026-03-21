import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "@kayle-id/auth/server";
import { env } from "@kayle-id/config/env";
import { logSafeError } from "@kayle-id/config/logging";
import { getRequestLogger } from "@/logging";
import { internalCreateOrganization } from "./openapi";

const createOrganizationRoute = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { userId: string };
}>();

createOrganizationRoute.openapi(internalCreateOrganization, async (c) => {
  const { name, slug, logo } = c.req.valid("json");
  const log = getRequestLogger(c);

  let logoData: R2Object | null = null;

  if (logo) {
    // Convert base64 string to Uint8Array
    const base64Data = logo.data;
    const contentType = logo.contentType;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Generate a unique key for the logo
    const logoKey = `logos/${crypto.randomUUID()}`;

    logoData = await env.STORAGE.put(logoKey, bytes, {
      httpMetadata: {
        contentType,
      },
    });
  }

  try {
    const state = await auth.api.createOrganization({
      body: {
        name,
        slug,
        ...(logoData
          ? {
              logo:
                process.env.NODE_ENV === "production"
                  ? `https://cdn.kayle.id/${logoData.key}`
                  : `http://127.0.0.1:8787/r2/${logoData.key}`,
            }
          : {}),
        userId: c.get("userId"),
      },
    });

    if (!state?.id) {
      throw new Error("Failed to create organization — No ID returned");
    }

    return c.json(
      {
        data: { id: state.id },
        error: null,
      },
      200
    );
  } catch (error) {
    logSafeError(log, {
      code: "organization_create_failed",
      error,
      event: "organizations.create.failed",
      message: "The organization could not be created.",
      status: 500,
    });
    return c.json(
      {
        data: null,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create organization",
          hint: "Please try again in a few moments.",
          docs: "https://kayle.id/docs/api/errors#internal_server_error",
        } as const,
      },
      500
    );
  }
});

export default createOrganizationRoute;
