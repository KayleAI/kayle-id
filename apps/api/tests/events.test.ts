import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { events as coreEvents } from "@kayle-id/database/schema/core";
import {
  webhook_deliveries,
  webhook_encryption_keys,
  webhook_endpoints,
} from "@kayle-id/database/schema/webhooks";
import { file } from "bun";
import { eq } from "drizzle-orm";
import { exportJWK, importSPKI } from "jose";
import app from "@/index";
import { createWebhookDeliveriesForVerificationSucceeded } from "@/v1/webhooks/deliveries/service";
import { encryptWebhookSigningSecret } from "@/v1/webhooks/signing-secret";
import { setup, type TestData, teardown } from "./setup";

let TEST_DATA: TestData | undefined;

type WebhookEventResponse = {
  created_at: string;
  deliveries: Array<{
    attempt_count: number;
    id: string;
    last_attempt_at: string | null;
    last_status_code: number | null;
    status: "delivering" | "failed" | "pending" | "succeeded";
    webhook_endpoint_id: string;
  }>;
  id: string;
  trigger_id: string;
  trigger_type: "verification_attempt" | "verification_session";
  type: string;
};

beforeAll(async () => {
  TEST_DATA = await setup();
});

afterEach(async () => {
  if (!TEST_DATA?.organizationId) {
    return;
  }

  await db
    .delete(webhook_endpoints)
    .where(eq(webhook_endpoints.organizationId, TEST_DATA.organizationId));
  await db
    .delete(coreEvents)
    .where(eq(coreEvents.organizationId, TEST_DATA.organizationId));
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
});

async function seedWebhookEvent(): Promise<{
  deliveryId: string;
  endpointId: string;
  eventId: string;
}> {
  const publicKeyText = await file(
    new URL("../../../tests/secrets/rsa_public.pem", import.meta.url)
  ).text();
  const publicJwk = await exportJWK(
    await importSPKI(publicKeyText, "RSA-OAEP-256")
  );
  const signingSecretCiphertext = await encryptWebhookSigningSecret({
    plaintext: "whsec_events_secret",
    secret: env.AUTH_SECRET,
  });
  const endpointId = `whe_live_events_${crypto.randomUUID()}`;
  const keyId = `whk_live_events_${crypto.randomUUID()}`;
  const eventId = `evt_live_events_${crypto.randomUUID()}`;

  const [endpoint] = await db
    .insert(webhook_endpoints)
    .values({
      id: endpointId,
      organizationId: TEST_DATA?.organizationId ?? "",
      environment: "live",
      signingSecretCiphertext,
      subscribedEventTypes: ["verification.attempt.succeeded"],
      url: "https://example.com/webhooks/events",
    })
    .returning();

  await db.insert(webhook_encryption_keys).values({
    id: keyId,
    webhookEndpointId: endpoint.id,
    keyId: "rsa-key-events",
    algorithm: "RSA-OAEP-256",
    keyType: "RSA",
    jwk: publicJwk,
  });

  await db.insert(coreEvents).values({
    id: eventId,
    organizationId: TEST_DATA?.organizationId ?? "",
    environment: "live",
    type: "verification.attempt.succeeded",
    triggerId: `va_live_events_${crypto.randomUUID()}`,
    triggerType: "verification_attempt",
  });

  const [deliveryId] = await createWebhookDeliveriesForVerificationSucceeded({
    attemptId: `va_live_events_${crypto.randomUUID()}`,
    environment: "live",
    eventId,
    manifest: {
      claims: {
        family_name: "DOE",
      },
      contractVersion: 1,
      selectedFieldKeys: ["family_name"],
      sessionId: `vs_live_events_${crypto.randomUUID()}`,
    },
    organizationId: TEST_DATA?.organizationId ?? "",
  });

  if (!deliveryId) {
    throw new Error("expected_webhook_delivery_to_be_created");
  }

  return {
    deliveryId,
    endpointId: endpoint.id,
    eventId,
  };
}

describe("/v1/webhooks/events", () => {
  test.serial(
    "GET / returns webhook events with delivery summaries",
    async () => {
      const seeded = await seedWebhookEvent();

      const response = await app.request("/v1/webhooks/events?limit=10", {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "GET",
      });

      expect(response.status).toBe(200);

      const payload = (await response.json()) as {
        data: WebhookEventResponse[];
        error: null;
        pagination: {
          has_more: boolean;
          limit: number;
          next_cursor: string | null;
        };
      };

      const event = payload.data.find((item) => item.id === seeded.eventId);

      expect(payload.error).toBeNull();
      expect(event).toBeDefined();
      expect(event?.deliveries).toEqual([
        {
          attempt_count: 0,
          id: seeded.deliveryId,
          last_attempt_at: null,
          last_status_code: null,
          status: "pending",
          webhook_endpoint_id: seeded.endpointId,
        },
      ]);
    }
  );

  test.serial(
    "GET /:event_id returns a single webhook event with delivery summaries",
    async () => {
      const seeded = await seedWebhookEvent();

      const response = await app.request(
        `/v1/webhooks/events/${seeded.eventId}`,
        {
          headers: {
            Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          },
          method: "GET",
        }
      );

      expect(response.status).toBe(200);

      const payload = (await response.json()) as {
        data: WebhookEventResponse;
        error: null;
      };

      expect(payload.error).toBeNull();
      expect(payload.data.id).toBe(seeded.eventId);
      expect(payload.data.deliveries).toEqual([
        {
          attempt_count: 0,
          id: seeded.deliveryId,
          last_attempt_at: null,
          last_status_code: null,
          status: "pending",
          webhook_endpoint_id: seeded.endpointId,
        },
      ]);
    }
  );

  test.serial(
    "POST /:event_id/replay requeues existing deliveries for the event",
    async () => {
      const seeded = await seedWebhookEvent();

      await db
        .update(webhook_deliveries)
        .set({
          attemptCount: 2,
          lastAttemptAt: new Date("2099-01-01T00:00:00.000Z"),
          lastStatusCode: 500,
          nextAttemptAt: null,
          status: "failed",
        })
        .where(eq(webhook_deliveries.id, seeded.deliveryId));

      const response = await app.request(
        `/v1/webhooks/events/${seeded.eventId}/replay`,
        {
          headers: {
            Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          },
          method: "POST",
        }
      );

      expect(response.status).toBe(202);

      const payload = (await response.json()) as {
        data: WebhookEventResponse;
        error: null;
      };

      expect(payload.error).toBeNull();
      expect(payload.data.id).toBe(seeded.eventId);
      expect(payload.data.deliveries).toEqual([
        {
          attempt_count: 0,
          id: seeded.deliveryId,
          last_attempt_at: null,
          last_status_code: null,
          status: "pending",
          webhook_endpoint_id: seeded.endpointId,
        },
      ]);

      const [delivery] = await db
        .select()
        .from(webhook_deliveries)
        .where(eq(webhook_deliveries.id, seeded.deliveryId))
        .limit(1);

      expect(delivery?.status).toBe("pending");
      expect(delivery?.attemptCount).toBe(0);
      expect(delivery?.lastAttemptAt).toBeNull();
      expect(delivery?.lastStatusCode).toBeNull();
    }
  );
});
