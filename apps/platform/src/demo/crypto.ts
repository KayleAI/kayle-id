const BASE64_URL_PADDING_PATTERN = /=+$/u;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]);

function decodeBase64Url(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);

  for (const [index, character] of Array.from(decoded).entries()) {
    bytes[index] = character.charCodeAt(0);
  }

  return bytes;
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function concatenateBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function parseSignatureHeader(signatureHeader: string): {
  timestamp: string;
  v1: string;
} | null {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signature = parts.find((part) => part.startsWith("v1="))?.slice(3);

  if (!(timestamp && signature)) {
    return null;
  }

  return {
    timestamp,
    v1: signature,
  };
}

function signaturesMatch(left: string, right: string): boolean {
  return left === right;
}

async function createHmacHex({
  payload,
  secret,
}: {
  payload: string;
  secret: string;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(secret),
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
    TEXT_ENCODER.encode(payload)
  );

  return encodeHex(new Uint8Array(signature));
}

export async function generateDemoKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
}> {
  const { privateKey, publicKey } = (await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
      modulusLength: 2048,
      publicExponent: RSA_PUBLIC_EXPONENT,
    },
    true,
    ["encrypt", "decrypt"]
  )) as CryptoKeyPair;

  const exported = (await crypto.subtle.exportKey(
    "jwk",
    publicKey
  )) as JsonWebKey;

  return {
    privateKey,
    publicJwk: {
      ...exported,
      alg: "RSA-OAEP-256",
      ext: true,
      key_ops: ["encrypt"],
      use: "enc",
    },
  };
}

export async function verifyWebhookSignature({
  payload,
  secret,
  signatureHeader,
}: {
  payload: string;
  secret: string;
  signatureHeader: string;
}): Promise<{ ok: true } | { message: string; ok: false }> {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) {
    return {
      ok: false,
      message: "Webhook signature header is malformed.",
    };
  }

  const expectedSignature = await createHmacHex({
    payload: `${parsed.timestamp}.${payload}`,
    secret,
  });

  if (!signaturesMatch(expectedSignature, parsed.v1.toLowerCase())) {
    return {
      ok: false,
      message: "Webhook signature verification failed.",
    };
  }

  return { ok: true };
}

export async function decryptCompactJwe({
  jwe,
  privateKey,
}: {
  jwe: string;
  privateKey: CryptoKey;
}): Promise<string> {
  const parts = jwe.split(".");
  if (parts.length !== 5) {
    throw new Error("demo_jwe_format_invalid");
  }

  const [
    protectedHeaderPart,
    encryptedKeyPart,
    ivPart,
    ciphertextPart,
    tagPart,
  ] = parts;

  const protectedHeaderBytes = decodeBase64Url(protectedHeaderPart);
  const protectedHeaderAad = TEXT_ENCODER.encode(protectedHeaderPart);
  const protectedHeaderText = TEXT_DECODER.decode(protectedHeaderBytes);
  const protectedHeader = JSON.parse(protectedHeaderText) as {
    alg?: string;
    enc?: string;
  };

  if (protectedHeader.alg !== "RSA-OAEP-256") {
    throw new Error("demo_jwe_alg_unsupported");
  }

  if (protectedHeader.enc !== "A256GCM") {
    throw new Error("demo_jwe_enc_unsupported");
  }

  const cek = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    toArrayBuffer(decodeBase64Url(encryptedKeyPart))
  );

  const contentEncryptionKey = await crypto.subtle.importKey(
    "raw",
    cek,
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(decodeBase64Url(ivPart)),
      additionalData: toArrayBuffer(protectedHeaderAad),
      tagLength: 128,
    },
    contentEncryptionKey,
    toArrayBuffer(
      concatenateBytes(
        decodeBase64Url(ciphertextPart),
        decodeBase64Url(tagPart)
      )
    )
  );

  return TEXT_DECODER.decode(plaintext);
}

export function maskSecret(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-4)}`.replace(
    BASE64_URL_PADDING_PATTERN,
    ""
  );
}
