import { expect, test } from "bun:test";
import {
  createWebhookSignatureHeader,
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
} from "@/v1/webhooks/signing-secret";

test("encryptWebhookSigningSecret round-trips the secret", async () => {
  const ciphertext = await encryptWebhookSigningSecret({
    plaintext: "whsec_test_secret",
    secret: "auth-secret",
  });

  expect(ciphertext).toContain(".");

  const plaintext = await decryptWebhookSigningSecret({
    ciphertext,
    secret: "auth-secret",
  });

  expect(plaintext).toBe("whsec_test_secret");
});

test("createWebhookSignatureHeader uses Stripe-style timestamped output", async () => {
  const header = await createWebhookSignatureHeader({
    payload: "encrypted-payload",
    secret: "whsec_test_secret",
    timestamp: 1_742_404_800,
  });

  expect(header.startsWith("t=1742404800,v1=")).toBeTrue();
});
