import { expect, test } from "vitest";
import { createJWE } from "../../../api/src/functions/jwe";
import {
  decryptCompactJwe,
  generateDemoKeyPair,
  verifyWebhookSignature,
} from "./crypto";

async function createSignatureHeader({
  payload,
  secret,
  timestamp,
}: {
  payload: string;
  secret: string;
  timestamp: number;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );

  const hex = Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  return `t=${timestamp},v1=${hex}`;
}

test("verifyWebhookSignature accepts a valid platform demo signature", async () => {
  const payload = "encrypted-payload";
  const secret = "whsec_demo_test_secret";
  const signatureHeader = await createSignatureHeader({
    payload,
    secret,
    timestamp: 1_700_000_000,
  });

  const result = await verifyWebhookSignature({
    payload,
    secret,
    signatureHeader,
  });

  expect(result).toEqual({ ok: true });
});

test("verifyWebhookSignature rejects a tampered payload", async () => {
  const signatureHeader = await createSignatureHeader({
    payload: "original",
    secret: "whsec_demo_test_secret",
    timestamp: 1_700_000_000,
  });

  const result = await verifyWebhookSignature({
    payload: "tampered",
    secret: "whsec_demo_test_secret",
    signatureHeader,
  });

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected_signature_failure");
  }

  expect(result.message).toContain("verification failed");
});

test("decryptCompactJwe decrypts the Phase 11 webhook payload locally", async () => {
  const { privateKey, publicJwk } = await generateDemoKeyPair();
  const plaintext = JSON.stringify({
    type: "verification.attempt.succeeded",
    data: {
      claims: {
        document_number: "123456789",
      },
      selected_field_keys: ["document_number"],
    },
    metadata: {
      contract_version: 1,
      event_id: "evt_demo_test",
      verification_attempt_id: "va_demo_test",
      verification_session_id: "vs_demo_test",
    },
  });

  const jwe = await createJWE(plaintext, {
    publicJwk,
    algorithm: "RSA-OAEP-256",
    encryptionAlgorithm: "A256GCM",
  });

  const decrypted = await decryptCompactJwe({
    jwe,
    privateKey,
  });

  expect(decrypted).toBe(plaintext);
});
