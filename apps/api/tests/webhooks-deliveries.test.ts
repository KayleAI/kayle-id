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
import { events } from "@kayle-id/database/schema/core";
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
    .delete(events)
    .where(eq(events.organizationId, TEST_DATA.organizationId));
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
});

async function seedDelivery(): Promise<string> {
  const publicKeyText = await file(
    new URL("../../../tests/secrets/rsa_public.pem", import.meta.url)
  ).text();
  const publicJwk = await exportJWK(
    await importSPKI(publicKeyText, "RSA-OAEP-256")
  );
  const signingSecretCiphertext = await encryptWebhookSigningSecret({
    plaintext: "whsec_delivery_route_secret",
    secret: env.AUTH_SECRET,
  });

  const [endpoint] = await db
    .insert(webhook_endpoints)
    .values({
      id: `whe_test_route_${crypto.randomUUID()}`,
      organizationId: TEST_DATA?.organizationId ?? "",
      environment: "test",
      signingSecretCiphertext,
      subscribedEventTypes: ["verification.attempt.succeeded"],
      url: "https://example.com/webhooks/deliveries",
    })
    .returning();

  await db.insert(webhook_encryption_keys).values({
    id: `whk_test_route_${crypto.randomUUID()}`,
    webhookEndpointId: endpoint.id,
    keyId: "rsa-key-route",
    algorithm: "RSA-OAEP-256",
    keyType: "RSA",
    jwk: publicJwk,
  });

  const [event] = await db
    .insert(events)
    .values({
      id: `evt_test_route_${crypto.randomUUID()}`,
      organizationId: TEST_DATA?.organizationId ?? "",
      environment: "test",
      type: "verification.attempt.succeeded",
      triggerId: `va_test_route_${crypto.randomUUID()}`,
      triggerType: "verification_attempt",
    })
    .returning();

  const [deliveryId] = await createWebhookDeliveriesForVerificationSucceeded({
    attemptId: `va_test_delivery_${crypto.randomUUID()}`,
    environment: "test",
    eventId: event.id,
    manifest: {
      claims: {
        family_name: "DOE",
      },
      contractVersion: 1,
      selectedFieldKeys: ["family_name"],
      sessionId: `vs_test_delivery_${crypto.randomUUID()}`,
    },
    organizationId: TEST_DATA?.organizationId ?? "",
  });

  if (!deliveryId) {
    throw new Error("expected_delivery_id");
  }

  return deliveryId;
}

describe("/v1/webhooks/deliveries", () => {
  test("lists deliveries and retries a delivery", async () => {
    const deliveryId = await seedDelivery();

    const listResponse = await app.request("/v1/webhooks/deliveries", {
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
      method: "GET",
    });

    expect(listResponse.status).toBe(200);

    const listPayload = (await listResponse.json()) as {
      data: Array<{
        attempt_count: number;
        id: string;
        status: "delivering" | "failed" | "pending" | "succeeded";
      }>;
      error: null;
      pagination: {
        has_more: boolean;
        limit: number;
        next_cursor: string | null;
      };
    };

    expect(listPayload.error).toBeNull();
    expect(
      listPayload.data.find((delivery) => delivery.id === deliveryId)
    ).toMatchObject({
      attempt_count: 0,
      id: deliveryId,
      status: "pending",
    });

    await db
      .update(webhook_deliveries)
      .set({
        attemptCount: 2,
        lastAttemptAt: new Date("2099-01-01T00:00:00.000Z"),
        lastStatusCode: 500,
        nextAttemptAt: null,
        status: "failed",
      })
      .where(eq(webhook_deliveries.id, deliveryId));

    const retryResponse = await app.request(
      `/v1/webhooks/deliveries/${deliveryId}/retry`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "POST",
      }
    );

    expect(retryResponse.status).toBe(200);

    const retryPayload = (await retryResponse.json()) as {
      data: {
        attempt_count: number;
        id: string;
        last_attempt_at: string | null;
        last_status_code: number | null;
        next_attempt_at: string | null;
        status: "delivering" | "failed" | "pending" | "succeeded";
      };
      error: null;
    };

    expect(retryPayload.error).toBeNull();
    expect(retryPayload.data.id).toBe(deliveryId);
    expect(retryPayload.data.status).toBe("pending");
    expect(retryPayload.data.attempt_count).toBe(0);
    expect(retryPayload.data.last_attempt_at).toBeNull();
    expect(retryPayload.data.last_status_code).toBeNull();
    expect(retryPayload.data.next_attempt_at).toBeNull();
  });
});
