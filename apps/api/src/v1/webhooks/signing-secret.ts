import { createHMAC } from "@/functions/hmac";

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const BASE64_URL_PADDING_SUFFIX_PATTERN = /=+$/u;

function encodeBase64Url(bytes: Uint8Array): string {
  let output = "";

  for (const byte of bytes) {
    output += String.fromCharCode(byte);
  }

  return btoa(output)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_URL_PADDING_SUFFIX_PATTERN, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${"=".repeat(paddingLength)}`;
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);

  for (const [index, character] of Array.from(decoded).entries()) {
    bytes[index] = character.charCodeAt(0);
  }

  return bytes;
}

async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", secretBytes);

  return crypto.subtle.importKey("raw", digest, ALGORITHM, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptWebhookSigningSecret({
  plaintext,
  secret,
}: {
  plaintext: string;
  secret: string;
}): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveEncryptionKey(secret);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    {
      iv,
      name: ALGORITHM,
    },
    key,
    plaintextBytes
  );

  return `${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptWebhookSigningSecret({
  ciphertext,
  secret,
}: {
  ciphertext: string;
  secret: string;
}): Promise<string> {
  const [encodedIv, encodedCiphertext] = ciphertext.split(".");

  if (!(encodedIv && encodedCiphertext)) {
    throw new Error("webhook_signing_secret_ciphertext_invalid");
  }

  const iv = decodeBase64Url(encodedIv);
  const encryptedBytes = decodeBase64Url(encodedCiphertext);
  const key = await deriveEncryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    {
      iv,
      name: ALGORITHM,
    },
    key,
    encryptedBytes
  );

  return new TextDecoder().decode(plaintext);
}

export async function createWebhookSignatureHeader({
  payload,
  secret,
  timestamp = Math.floor(Date.now() / 1000),
}: {
  payload: string;
  secret: string;
  timestamp?: number;
}): Promise<string> {
  const signature = await createHMAC(`${timestamp}.${payload}`, {
    secret,
  });

  return `t=${timestamp},v1=${signature}`;
}
