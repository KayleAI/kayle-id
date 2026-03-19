import { OpenAPIHono } from "@hono/zod-openapi";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { webhook_endpoints } from "@kayle-id/database/schema/webhooks";
import { and, eq } from "drizzle-orm";
import { rotateWebhookEndpointSigningSecret } from "@/openapi/v1/webhooks/endpoints/rotate-signing-secret";
import { encryptWebhookSigningSecret } from "@/v1/webhooks/signing-secret";
import { generateSigningSecret } from "./utils";

const rotateSigningSecretEndpoint = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

rotateSigningSecretEndpoint.openapi(
  rotateWebhookEndpointSigningSecret,
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
            docs: "https://kayle.id/docs/api/webhooks/endpoints#rotate-signing-secret",
          },
        },
        404
      );
    }

    const signingSecret = generateSigningSecret();
    const authSecret = c.env?.AUTH_SECRET ?? env.AUTH_SECRET;
    const signingSecretCiphertext = await encryptWebhookSigningSecret({
      plaintext: signingSecret,
      secret: authSecret,
    });

    await db
      .update(webhook_endpoints)
      .set({
        signingSecretCiphertext,
      })
      .where(eq(webhook_endpoints.id, endpoint.id));

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
  }
);

export { rotateSigningSecretEndpoint };
