type Algorithm = "SHA256";

/**
 * Create an HMAC SHA-256 signature using the Web Crypto API.
 *
 * Returns the raw signature as a lowercase hex-encoded string.
 *
 * @param payload - Data to sign
 * @param secret - HMAC secret
 * @param algorithm - HMAC algorithm (currently only SHA256)
 */
export async function createHMAC(
  payload: string | Uint8Array,
  {
    secret,
    algorithm = "SHA256",
  }: {
    secret: string | Uint8Array;
    timestamp?: number;
    algorithm?: Algorithm;
  }
): Promise<string> {
  const payloadBytes =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;

  const secretBytes =
    typeof secret === "string" ? new TextEncoder().encode(secret) : secret;

  if (algorithm !== "SHA256") {
    throw new Error(`Unsupported HMAC algorithm: ${algorithm}`);
  }

  if (!("crypto" in globalThis && "subtle" in crypto)) {
    throw new Error("Web Crypto API is not available");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);

  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex;
}
