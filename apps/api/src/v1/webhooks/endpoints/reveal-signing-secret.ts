import { OpenAPIHono } from "@hono/zod-openapi";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { webhook_endpoints } from "@kayle-id/database/schema/webhooks";
import { and, eq } from "drizzle-orm";
import { revealWebhookEndpointSigningSecret } from "@/openapi/v1/webhooks/endpoints/reveal-signing-secret";
import { decryptWebhookSigningSecret } from "@/v1/webhooks/signing-secret";

const revealSigningSecretEndpoint = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

revealSigningSecretEndpoint.openapi(
  revealWebhookEndpointSigningSecret,
  async (c) => {
    const organizationId = c.get("organizationId");
    const params = c.req.valid("param");

    const [endpoint] = await db
      .select()
      .from(webhook_endpoints)
      .where(
        and(
          eq(webhook_endpoints.id, params.endpoint_id),
          eq(webhook_endpoints.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!endpoint) {
      return c.json(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Webhook endpoint not found.",
            hint: "The webhook endpoint with the given ID was not found.",
            docs: "https://kayle.id/docs/api/webhooks/endpoints#reveal-signing-secret",
          } as const,
        },
        404
      );
    }

    if (!endpoint.signingSecretCiphertext) {
      return c.json(
        {
          data: null,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error.",
            hint: "The server encountered an error.",
            docs: "https://kayle.id/docs/api/errors",
          } as const,
        },
        500
      );
    }

    try {
      const signingSecret = await decryptWebhookSigningSecret({
        ciphertext: endpoint.signingSecretCiphertext,
        secret: c.env?.AUTH_SECRET ?? env.AUTH_SECRET,
      });

      return c.json(
        {
          data: {
            endpoint_id: endpoint.id,
            signing_secret: signingSecret,
          },
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
            message: "Internal server error.",
            hint: "The server encountered an error.",
            docs: "https://kayle.id/docs/api/errors",
          } as const,
        },
        500
      );
    }
  }
);

export { revealSigningSecretEndpoint };
