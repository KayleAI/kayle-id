import { CompactEncrypt, importSPKI } from "jose";

type JWEAlg = "RSA-OAEP-256";

type JWEEnc = "A128GCM" | "A192GCM" | "A256GCM";

/**
 * Create a JWE (JSON Web Encryption)
 *
 * @param payload - The payload to encrypt
 * @param {options} - The options for the JWE
 * @returns {Promise<string>} - The JWE
 */
export async function createJWE(
  payload: string | Uint8Array,
  {
    keyId,
    publicKey,
    algorithm = "RSA-OAEP-256",
    encryptionAlgorithm = "A256GCM",
  }: {
    keyId?: string;
    publicKey?: string;
    algorithm?: JWEAlg;
    encryptionAlgorithm?: JWEEnc;
  } = {}
): Promise<string> {
  if (!(publicKey && publicKey.trim() !== "")) {
    throw new Error("Public key is required");
  }

  const publicKeyObject = await importSPKI(publicKey, algorithm);

  const bytes =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;

  return new CompactEncrypt(bytes)
    .setProtectedHeader({
      alg: algorithm,
      enc: encryptionAlgorithm,
      ...(keyId && { kid: keyId }),
    })
    .encrypt(publicKeyObject);
}
