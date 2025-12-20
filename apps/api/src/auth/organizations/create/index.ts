import { env } from "cloudflare:workers";
import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "@kayle-id/auth/server";
import { internalCreateOrganization } from "./openapi";

const createOrganizationRoute = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { userId: string };
}>();

createOrganizationRoute.openapi(internalCreateOrganization, async (c) => {
  const { name, slug, logo } = c.req.valid("json");

  let logoData: R2Object | null = null;

  if (logo) {
    // Convert base64 string to Blob
    const base64Data = logo.data;
    const contentType = logo.contentType;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: contentType });

    // Generate a unique key for the logo
    const logoKey = `logos/${crypto.randomUUID()}`;

    logoData = await env.STORAGE.put(logoKey, blob, {
      httpMetadata: {
        contentType,
      },
    });
  }

  const state = await auth.api.createOrganization({
    body: {
      name,
      slug,
      logo: logoData
        ? `https://${process.env.NODE_ENV === "production" ? "cdn" : "cdn-dev"}.kayle.id/${logoData.key}`
        : undefined,
      userId: c.get("userId"),
    },
  });

  if (!state?.id) {
    return c.json(
      {
        data: null,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create organization",
          hint: "Please try again in a few moments.",
          docs: "https://kayle.id/docs/api/errors#internal_server_error",
        } as const,
      },
      500
    );
  }

  return c.json(
    {
      data: { id: state.id },
      error: null,
    },
    200
  );
});

export default createOrganizationRoute;
