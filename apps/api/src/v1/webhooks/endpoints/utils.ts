import {
  SUPPORTED_WEBHOOK_EVENT_TYPES,
  type SupportedWebhookEventType,
} from "@kayle-id/config/webhook-events";
import type {
  webhook_encryption_keys,
  webhook_endpoints,
} from "@kayle-id/database/schema/webhooks";

export type Environment = "live" | "test";

const SIGNING_SECRET_RANDOM_LENGTH = 32;

export function generateRandomString(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const randomBytes = new Uint8Array(length);

  crypto.getRandomValues(randomBytes);

  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += alphabet[randomBytes[i] % alphabet.length];
  }

  return result;
}

export function generateEndpointId(environment: Environment): string {
  return `whe_${environment}_${generateRandomString(32)}`;
}

export function generateKeyId(environment: Environment): string {
  return `whk_${environment}_${generateRandomString(32)}`;
}

export function generateSigningSecret(): string {
  return `whsec_${generateRandomString(SIGNING_SECRET_RANDOM_LENGTH)}`;
}

function normalizeSubscribedEventTypes(
  value: unknown
): SupportedWebhookEventType[] {
  if (!Array.isArray(value)) {
    return [...SUPPORTED_WEBHOOK_EVENT_TYPES];
  }

  const normalized = value.filter(
    (eventType): eventType is SupportedWebhookEventType =>
      SUPPORTED_WEBHOOK_EVENT_TYPES.includes(
        eventType as SupportedWebhookEventType
      )
  );

  return normalized.length > 0
    ? normalized
    : [...SUPPORTED_WEBHOOK_EVENT_TYPES];
}

export function mapEndpointRowToResponse(
  row: typeof webhook_endpoints.$inferSelect,
  organizationId: string
) {
  return {
    id: row.id,
    organization_id: organizationId,
    environment: row.environment as Environment,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    subscribed_event_types: normalizeSubscribedEventTypes(
      row.subscribedEventTypes
    ),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    disabled_at: row.disabledAt ? row.disabledAt.toISOString() : null,
  };
}

export function mapKeyRowToResponse(
  row: typeof webhook_encryption_keys.$inferSelect
) {
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
