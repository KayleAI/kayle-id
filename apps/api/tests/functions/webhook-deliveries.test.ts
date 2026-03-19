import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
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
import { compactDecrypt, exportJWK, importPKCS8, importSPKI } from "jose";
import {
  attemptWebhookDelivery,
  createWebhookDeliveriesForVerificationSucceeded,
} from "@/v1/webhooks/deliveries/service";
import { encryptWebhookSigningSecret } from "@/v1/webhooks/signing-secret";
import { setup, TEST_DATA, teardown } from "../setup";

const originalFetch = globalThis.fetch;

beforeAll(async () => {
  await setup();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
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
  await teardown();
});

test("createWebhookDeliveriesForVerificationSucceeded creates a pending encrypted delivery for subscribed endpoints", async () => {
  const publicKeyText = await file(
    new URL("../../../../tests/secrets/rsa_public.pem", import.meta.url)
  ).text();
  const publicJwk = await exportJWK(
    await importSPKI(publicKeyText, "RSA-OAEP-256")
  );
  const signingSecretCiphertext = await encryptWebhookSigningSecret({
    plaintext: "whsec_delivery_secret",
    secret: env.AUTH_SECRET,
  });

  const [endpoint] = await db
    .insert(webhook_endpoints)
    .values({
      id: "whe_test_delivery_pending",
      organizationId: TEST_DATA?.organizationId ?? "",
      environment: "test",
      signingSecretCiphertext,
      subscribedEventTypes: ["verification.attempt.succeeded"],
      url: "https://example.com/webhooks/kayle",
    })
    .returning();

  const [key] = await db
    .insert(webhook_encryption_keys)
    .values({
      id: "whk_test_delivery_pending",
      webhookEndpointId: endpoint.id,
      keyId: "rsa-key-1",
      algorithm: "RSA-OAEP-256",
      keyType: "RSA",
      jwk: publicJwk,
    })
    .returning();

  const [event] = await db
    .insert(events)
    .values({
      id: "evt_test_delivery_pending",
      organizationId: TEST_DATA?.organizationId ?? "",
      environment: "test",
      type: "verification.attempt.succeeded",
      triggerId: "va_test_delivery_pending",
      triggerType: "verification_attempt",
    })
    .returning();

  const deliveryIds = await createWebhookDeliveriesForVerificationSucceeded({
    attemptId: "va_test_delivery_pending",
    environment: "test",
    eventId: event.id,
    manifest: {
      claims: {
        dg1_surname: "DOE",
      },
      contractVersion: 1,
      selectedFieldKeys: ["dg1_surname"],
      sessionId: "vs_test_delivery_pending",
    },
    organizationId: TEST_DATA?.organizationId ?? "",
  });

  expect(deliveryIds).toHaveLength(1);
  expect(deliveryIds[0]?.startsWith("whd_test_")).toBeTrue();

  const [delivery] = await db
    .select()
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.id, deliveryIds[0] ?? ""))
    .limit(1);

  expect(delivery?.status).toBe("pending");
  expect(delivery?.webhookEncryptionKeyId).toBe(key.id);
  expect(delivery?.payload).toBeString();

  const privateKeyText = await file(
    new URL("../../../../tests/secrets/rsa_private.pem", import.meta.url)
  ).text();
  const { plaintext } = await compactDecrypt(
    delivery?.payload ?? "",
    await importPKCS8(privateKeyText, "RSA-OAEP-256")
  );
  const decodedPayload = JSON.parse(new TextDecoder().decode(plaintext)) as {
    claims: {
      dg1_surname: string;
    };
    type: string;
  };

  expect(decodedPayload.type).toBe("verification.attempt.succeeded");
  expect(decodedPayload.claims.dg1_surname).toBe("DOE");
});

test("attemptWebhookDelivery signs and delivers the encrypted payload", async () => {
  const publicKeyText = await file(
    new URL("../../../../tests/secrets/rsa_public.pem", import.meta.url)
  ).text();
  const publicJwk = await exportJWK(
    await importSPKI(publicKeyText, "RSA-OAEP-256")
  );
  const signingSecretCiphertext = await encryptWebhookSigningSecret({
    plaintext: "whsec_delivery_sign",
    secret: env.AUTH_SECRET,
  });

  const [endpoint] = await db
    .insert(webhook_endpoints)
    .values({
      id: "whe_test_delivery_send",
      organizationId: TEST_DATA?.organizationId ?? "",
      environment: "test",
      signingSecretCiphertext,
      subscribedEventTypes: ["verification.attempt.succeeded"],
      url: "https://example.com/webhooks/send",
    })
    .returning();
  await db.insert(webhook_encryption_keys).values({
    id: "whk_test_delivery_send",
    webhookEndpointId: endpoint.id,
    keyId: "rsa-key-2",
    algorithm: "RSA-OAEP-256",
    keyType: "RSA",
    jwk: publicJwk,
  });
  const [event] = await db
    .insert(events)
    .values({
      id: "evt_test_delivery_send",
      organizationId: TEST_DATA?.organizationId ?? "",
      environment: "test",
      type: "verification.attempt.succeeded",
      triggerId: "va_test_delivery_send",
      triggerType: "verification_attempt",
    })
    .returning();

  const [deliveryId] = await createWebhookDeliveriesForVerificationSucceeded({
    attemptId: "va_test_delivery_send",
    environment: "test",
    eventId: event.id,
    manifest: {
      claims: {
        dg1_document_number: "123456789",
      },
      contractVersion: 1,
      selectedFieldKeys: ["dg1_document_number"],
      sessionId: "vs_test_delivery_send",
    },
    organizationId: TEST_DATA?.organizationId ?? "",
  });

  let capturedSignature: string | null = null;
  let capturedContentType: string | null = null;
  let capturedBody = "";

  globalThis.fetch = mock(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request("https://example.com/webhooks/send", init);
      capturedSignature = request.headers.get("X-Kayle-Signature");
      capturedContentType = request.headers.get("Content-Type");
      capturedBody = await request.text();

      return new Response(null, {
        status: 202,
      });
    }
  ) as unknown as typeof fetch;

  const result = await attemptWebhookDelivery({
    authSecret: env.AUTH_SECRET,
    deliveryId,
  });

  if (!capturedContentType) {
    throw new Error("webhook_delivery_content_type_missing");
  }

  if (!capturedSignature) {
    throw new Error("webhook_delivery_headers_missing");
  }

  const contentType: string = capturedContentType;
  const signature: string = capturedSignature;

  expect(result?.status).toBe("succeeded");
  expect(result?.attempt_count).toBe(1);
  expect(contentType).toBe("application/jose");
  expect(signature.startsWith("t=")).toBeTrue();
  expect(capturedBody).toBeString();

  const [updatedDelivery] = await db
    .select()
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.id, deliveryId))
    .limit(1);

  expect(updatedDelivery?.status).toBe("succeeded");
  expect(updatedDelivery?.lastStatusCode).toBe(202);
  expect(updatedDelivery?.webhookEncryptionKeyId).toBe(
    "whk_test_delivery_send"
  );
});
