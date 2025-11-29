import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import {
  webhook_encryption_keys,
  webhook_endpoints,
} from "@kayle-id/database/schema/webhooks";
import { and, eq } from "drizzle-orm";
import { deactivateWebhookEncryptionKey } from "@/openapi/v1/webhooks/keys/deactivate";

const webhookEncryptionKeys = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    type: "api" | "session";
  };
}>();

function mapKeyRowToResponse(row: typeof webhook_encryption_keys.$inferSelect) {
  return {
    id: row.id,
    webhook_endpoint_id: row.webhookEndpointId,
    key_id: row.keyId,
    algorithm: row.algorithm,
    key_type: row.keyType,
    jwk: row.jwk as Record<string, unknown>,
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    disabled_at: row.disabledAt ? row.disabledAt.toISOString() : null,
  };
}

webhookEncryptionKeys.openapi(deactivateWebhookEncryptionKey, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");

  const [row] = await db
    .select({
      key: webhook_encryption_keys,
      endpointOrganizationId: webhook_endpoints.organizationId,
      endpointEnvironment: webhook_endpoints.environment,
    })
    .from(webhook_encryption_keys)
    .innerJoin(
      webhook_endpoints,
      eq(webhook_endpoints.id, webhook_encryption_keys.webhookEndpointId)
    )
    .where(
      and(
        eq(webhook_encryption_keys.id, params.key_id),
        eq(webhook_endpoints.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Webhook encryption key not found.",
          hint: "The webhook encryption key with the given ID was not found.",
          docs: "https://kayle.id/docs/api/webhooks/keys#deactivate",
        },
      },
      404
    );
  }

  const now = new Date();

  await db
    .update(webhook_encryption_keys)
    .set({
      isActive: false,
      disabledAt: now,
    })
    .where(eq(webhook_encryption_keys.id, row.key.id));

  const [updated] = await db
    .select()
    .from(webhook_encryption_keys)
    .where(eq(webhook_encryption_keys.id, row.key.id))
    .limit(1);

  const data = mapKeyRowToResponse(updated);

  return c.json(
    {
      data,
      error: null,
    },
    200
  );
});

export default webhookEncryptionKeys;
