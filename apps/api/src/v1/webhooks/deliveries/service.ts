import type { SupportedWebhookEventType } from "@kayle-id/config/webhook-events";
import { db } from "@kayle-id/database/drizzle";
import { events } from "@kayle-id/database/schema/core";
import {
  webhook_deliveries,
  webhook_delivery_attempts,
  webhook_encryption_keys,
  webhook_endpoints,
} from "@kayle-id/database/schema/webhooks";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { createJWE } from "@/functions/jwe";
import { generateId } from "@/utils/generate-id";
import type { VerifyShareManifest } from "@/v1/verify/share-manifest";
import {
  createWebhookSignatureHeader,
  decryptWebhookSigningSecret,
} from "@/v1/webhooks/signing-secret";

const MAX_DELIVERY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 60_000;

type DeliveryStatus = typeof webhook_deliveries.$inferSelect.status;

type VerificationSucceededPayload = {
  data: {
    claims: VerifyShareManifest["claims"];
    selected_field_keys: string[];
  };
  metadata: {
    contract_version: number;
    event_id: string;
    verification_attempt_id: string;
    verification_session_id: string;
  };
  type: SupportedWebhookEventType;
};

type DeliveryRowResponse = {
  attempt_count: number;
  created_at: string;
  event_id: string;
  id: string;
  last_attempt_at: string | null;
  last_status_code: number | null;
  next_attempt_at: string | null;
  status: DeliveryStatus;
  updated_at: string;
  webhook_encryption_key_id: string | null;
  webhook_endpoint_id: string;
};

function buildVerificationSucceededPayload({
  attemptId,
  eventId,
  manifest,
}: {
  attemptId: string;
  eventId: string;
  manifest: VerifyShareManifest;
}): VerificationSucceededPayload {
  return {
    data: {
      claims: manifest.claims,
      selected_field_keys: manifest.selectedFieldKeys,
    },
    metadata: {
      contract_version: manifest.contractVersion,
      event_id: eventId,
      verification_attempt_id: attemptId,
      verification_session_id: manifest.sessionId,
    },
    type: "verification.attempt.succeeded",
  };
}

function computeNextAttemptAt(attemptCount: number): Date | null {
  if (attemptCount >= MAX_DELIVERY_ATTEMPTS) {
    return null;
  }

  return new Date(
    Date.now() + INITIAL_RETRY_DELAY_MS * 2 ** (attemptCount - 1)
  );
}

function isSubscribedToEventType(
  subscribedEventTypes: unknown,
  eventType: SupportedWebhookEventType
): boolean {
  return (
    Array.isArray(subscribedEventTypes) &&
    subscribedEventTypes.includes(eventType)
  );
}

function mapWebhookDeliveryRowToResponse(
  row: typeof webhook_deliveries.$inferSelect
): DeliveryRowResponse {
  return {
    attempt_count: row.attemptCount,
    created_at: row.createdAt.toISOString(),
    event_id: row.eventId,
    id: row.id,
    last_attempt_at: row.lastAttemptAt?.toISOString() ?? null,
    last_status_code: row.lastStatusCode,
    next_attempt_at: row.nextAttemptAt?.toISOString() ?? null,
    status: row.status,
    updated_at: row.updatedAt.toISOString(),
    webhook_encryption_key_id: row.webhookEncryptionKeyId,
    webhook_endpoint_id: row.webhookEndpointId,
  };
}

async function insertAttempt({
  deliveryId,
  status,
  statusCode,
}: {
  deliveryId: string;
  status: "failed" | "succeeded";
  statusCode: number | null;
}): Promise<void> {
  const [delivery] = await db
    .select({
      environment: events.environment,
      organizationId: events.organizationId,
    })
    .from(webhook_deliveries)
    .innerJoin(events, eq(events.id, webhook_deliveries.eventId))
    .where(eq(webhook_deliveries.id, deliveryId))
    .limit(1);

  if (!delivery) {
    throw new Error("webhook_delivery_missing_for_attempt");
  }

  await db.insert(webhook_delivery_attempts).values({
    id: generateId({
      type: "wha",
      environment: delivery.environment,
    }),
    status,
    statusCode,
    webhookDeliveryId: deliveryId,
  });
}

async function markDeliveryFailedWithoutSend({
  deliveryId,
}: {
  deliveryId: string;
}): Promise<void> {
  const [delivery] = await db
    .select()
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.id, deliveryId))
    .limit(1);

  if (!delivery) {
    return;
  }

  const nextAttemptCount = delivery.attemptCount + 1;
  const nextAttemptAt = computeNextAttemptAt(nextAttemptCount);
  const now = new Date();

  await insertAttempt({
    deliveryId,
    status: "failed",
    statusCode: null,
  });

  await db
    .update(webhook_deliveries)
    .set({
      attemptCount: nextAttemptCount,
      lastAttemptAt: now,
      lastStatusCode: null,
      nextAttemptAt,
      status: nextAttemptAt ? "pending" : "failed",
    })
    .where(eq(webhook_deliveries.id, deliveryId));
}

async function getWebhookDeliveryById(
  deliveryId: string
): Promise<typeof webhook_deliveries.$inferSelect | null> {
  const [delivery] = await db
    .select()
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.id, deliveryId))
    .limit(1);

  return delivery ?? null;
}

async function getMappedWebhookDelivery(
  deliveryId: string
): Promise<DeliveryRowResponse | null> {
  const delivery = await getWebhookDeliveryById(deliveryId);

  return delivery ? mapWebhookDeliveryRowToResponse(delivery) : null;
}

async function markWebhookDeliveryFailedAndReload(
  deliveryId: string
): Promise<DeliveryRowResponse | null> {
  await markDeliveryFailedWithoutSend({
    deliveryId,
  });

  return getMappedWebhookDelivery(deliveryId);
}

type DeliveryAttemptContext = {
  delivery: typeof webhook_deliveries.$inferSelect;
  endpoint: typeof webhook_endpoints.$inferSelect;
};

async function getDeliveryAttemptContext(
  deliveryId: string
): Promise<DeliveryAttemptContext | null> {
  const [row] = await db
    .select({
      delivery: webhook_deliveries,
      endpoint: webhook_endpoints,
    })
    .from(webhook_deliveries)
    .innerJoin(
      webhook_endpoints,
      eq(webhook_endpoints.id, webhook_deliveries.webhookEndpointId)
    )
    .where(eq(webhook_deliveries.id, deliveryId))
    .limit(1);

  return row ?? null;
}

async function resolveEndpointSigningSecret({
  authSecret,
  endpoint,
}: {
  authSecret: string;
  endpoint: typeof webhook_endpoints.$inferSelect;
}): Promise<string | null> {
  if (!endpoint.signingSecretCiphertext) {
    return null;
  }

  try {
    return await decryptWebhookSigningSecret({
      ciphertext: endpoint.signingSecretCiphertext,
      secret: authSecret,
    });
  } catch {
    return null;
  }
}

async function sendWebhookDeliveryRequest({
  delivery,
  endpoint,
  signingSecret,
}: {
  delivery: typeof webhook_deliveries.$inferSelect;
  endpoint: typeof webhook_endpoints.$inferSelect;
  signingSecret: string;
}): Promise<Response> {
  const signatureHeader = await createWebhookSignatureHeader({
    payload: delivery.payload ?? "",
    secret: signingSecret,
  });

  return fetch(endpoint.url, {
    body: delivery.payload,
    headers: {
      "Content-Type": "application/jose",
      "X-Kayle-Delivery-Id": delivery.id,
      "X-Kayle-Event": "verification.attempt.succeeded",
      "X-Kayle-Signature": signatureHeader,
    },
    method: "POST",
  });
}

async function persistWebhookDeliveryAttemptResult({
  attemptedAt,
  delivery,
  response,
}: {
  attemptedAt: Date;
  delivery: typeof webhook_deliveries.$inferSelect;
  response: Response;
}): Promise<void> {
  const nextAttemptCount = delivery.attemptCount + 1;

  await insertAttempt({
    deliveryId: delivery.id,
    status: response.ok ? "succeeded" : "failed",
    statusCode: response.status,
  });

  if (response.ok) {
    await db
      .update(webhook_deliveries)
      .set({
        attemptCount: nextAttemptCount,
        lastAttemptAt: attemptedAt,
        lastStatusCode: response.status,
        nextAttemptAt: null,
        status: "succeeded",
      })
      .where(eq(webhook_deliveries.id, delivery.id));

    return;
  }

  const nextAttemptAt = computeNextAttemptAt(nextAttemptCount);

  await db
    .update(webhook_deliveries)
    .set({
      attemptCount: nextAttemptCount,
      lastAttemptAt: attemptedAt,
      lastStatusCode: response.status,
      nextAttemptAt,
      status: nextAttemptAt ? "pending" : "failed",
    })
    .where(eq(webhook_deliveries.id, delivery.id));
}

export async function createWebhookDeliveriesForVerificationSucceeded({
  attemptId,
  environment,
  eventId,
  manifest,
  organizationId,
}: {
  attemptId: string;
  environment: "live" | "test";
  eventId: string;
  manifest: VerifyShareManifest;
  organizationId: string;
}): Promise<string[]> {
  const payload = JSON.stringify(
    buildVerificationSucceededPayload({
      attemptId,
      eventId,
      manifest,
    })
  );

  const candidateEndpoints = await db
    .select()
    .from(webhook_endpoints)
    .where(
      and(
        eq(webhook_endpoints.organizationId, organizationId),
        eq(webhook_endpoints.environment, environment),
        eq(webhook_endpoints.enabled, true)
      )
    );

  const subscribedEndpoints = candidateEndpoints.filter((endpoint) =>
    isSubscribedToEventType(
      endpoint.subscribedEventTypes,
      "verification.attempt.succeeded"
    )
  );

  if (subscribedEndpoints.length === 0) {
    return [];
  }

  const encryptionKeys = await db
    .select()
    .from(webhook_encryption_keys)
    .where(
      and(
        eq(webhook_encryption_keys.isActive, true),
        inArray(
          webhook_encryption_keys.webhookEndpointId,
          subscribedEndpoints.map((endpoint) => endpoint.id)
        )
      )
    );

  const keysByEndpointId = new Map(
    encryptionKeys.map((key) => [key.webhookEndpointId, key])
  );
  const createdDeliveryIds: string[] = [];

  for (const endpoint of subscribedEndpoints) {
    const key = keysByEndpointId.get(endpoint.id) ?? null;
    const deliveryId = generateId({
      type: "whd",
      environment: endpoint.environment,
    });
    createdDeliveryIds.push(deliveryId);

    if (!key) {
      await db.insert(webhook_deliveries).values({
        id: deliveryId,
        attemptCount: 1,
        eventId,
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
        payload: null,
        status: "failed",
        webhookEndpointId: endpoint.id,
        webhookEncryptionKeyId: null,
      });
      await insertAttempt({
        deliveryId,
        status: "failed",
        statusCode: null,
      });
      continue;
    }

    try {
      const encryptedPayload = await createJWE(payload, {
        algorithm: "RSA-OAEP-256",
        keyId: key.keyId,
        publicJwk: key.jwk as Record<string, unknown>,
      });

      await db.insert(webhook_deliveries).values({
        eventId,
        id: deliveryId,
        payload: encryptedPayload,
        status: "pending",
        webhookEndpointId: endpoint.id,
        webhookEncryptionKeyId: key.id,
      });
    } catch {
      await db.insert(webhook_deliveries).values({
        id: deliveryId,
        attemptCount: 1,
        eventId,
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
        payload: null,
        status: "failed",
        webhookEndpointId: endpoint.id,
        webhookEncryptionKeyId: key.id,
      });
      await insertAttempt({
        deliveryId,
        status: "failed",
        statusCode: null,
      });
    }
  }
  return createdDeliveryIds;
}

export async function attemptWebhookDelivery({
  authSecret,
  deliveryId,
}: {
  authSecret: string;
  deliveryId: string;
}): Promise<DeliveryRowResponse | null> {
  const context = await getDeliveryAttemptContext(deliveryId);

  if (!context) {
    return null;
  }

  if (!(context.endpoint.enabled && context.delivery.payload)) {
    return markWebhookDeliveryFailedAndReload(deliveryId);
  }

  const signingSecret = await resolveEndpointSigningSecret({
    authSecret,
    endpoint: context.endpoint,
  });

  if (!signingSecret) {
    return markWebhookDeliveryFailedAndReload(deliveryId);
  }

  const now = new Date();
  await db
    .update(webhook_deliveries)
    .set({
      status: "delivering",
    })
    .where(eq(webhook_deliveries.id, deliveryId));

  try {
    const response = await sendWebhookDeliveryRequest({
      delivery: context.delivery,
      endpoint: context.endpoint,
      signingSecret,
    });
    await persistWebhookDeliveryAttemptResult({
      attemptedAt: now,
      delivery: context.delivery,
      response,
    });
  } catch {
    return markWebhookDeliveryFailedAndReload(deliveryId);
  }

  return getMappedWebhookDelivery(deliveryId);
}

export async function processDueWebhookDeliveries({
  authSecret,
  limit = 20,
}: {
  authSecret: string;
  limit?: number;
}): Promise<DeliveryRowResponse[]> {
  const dueDeliveries = await db
    .select()
    .from(webhook_deliveries)
    .where(
      and(
        eq(webhook_deliveries.status, "pending"),
        or(
          isNull(webhook_deliveries.nextAttemptAt),
          lte(webhook_deliveries.nextAttemptAt, new Date())
        )
      )
    )
    .orderBy(asc(webhook_deliveries.createdAt))
    .limit(limit);

  const processed: DeliveryRowResponse[] = [];

  for (const delivery of dueDeliveries) {
    const result = await attemptWebhookDelivery({
      authSecret,
      deliveryId: delivery.id,
    });

    if (result) {
      processed.push(result);
    }
  }

  return processed;
}

export async function getWebhookDeliveryForOrganization({
  deliveryId,
  organizationId,
}: {
  deliveryId: string;
  organizationId: string;
}): Promise<typeof webhook_deliveries.$inferSelect | null> {
  const [row] = await db
    .select({
      delivery: webhook_deliveries,
    })
    .from(webhook_deliveries)
    .innerJoin(events, eq(events.id, webhook_deliveries.eventId))
    .where(
      and(
        eq(webhook_deliveries.id, deliveryId),
        eq(events.organizationId, organizationId),
        eq(events.environment, "live")
      )
    )
    .limit(1);

  return row?.delivery ?? null;
}

export async function requeueWebhookDelivery({
  deliveryId,
}: {
  deliveryId: string;
}): Promise<typeof webhook_deliveries.$inferSelect | null> {
  await db
    .update(webhook_deliveries)
    .set({
      attemptCount: 0,
      lastAttemptAt: null,
      lastStatusCode: null,
      nextAttemptAt: null,
      status: "pending",
    })
    .where(eq(webhook_deliveries.id, deliveryId));

  const [updated] = await db
    .select()
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.id, deliveryId))
    .limit(1);

  return updated ?? null;
}

export async function requeueWebhookDeliveriesForEvent({
  eventId,
}: {
  eventId: string;
}): Promise<(typeof webhook_deliveries.$inferSelect)[]> {
  const deliveries = await db
    .select()
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.eventId, eventId));

  const requeued: (typeof webhook_deliveries.$inferSelect)[] = [];

  for (const delivery of deliveries) {
    const nextDelivery = await requeueWebhookDelivery({
      deliveryId: delivery.id,
    });

    if (nextDelivery) {
      requeued.push(nextDelivery);
    }
  }

  return requeued;
}

export { mapWebhookDeliveryRowToResponse };
