import { CompactEncrypt, importJWK, importSPKI, type JWK } from "jose";

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
    publicJwk,
    publicKey,
    algorithm = "RSA-OAEP-256",
    encryptionAlgorithm = "A256GCM",
  }: {
    keyId?: string;
    publicJwk?: JWK;
    publicKey?: string;
    algorithm?: JWEAlg;
    encryptionAlgorithm?: JWEEnc;
  } = {}
): Promise<string> {
  let publicKeyObject: Awaited<ReturnType<typeof importJWK>> | null = null;

  if (publicJwk) {
    publicKeyObject = await importJWK(publicJwk, algorithm);
  } else if (publicKey && publicKey.trim() !== "") {
    publicKeyObject = await importSPKI(publicKey, algorithm);
  }

  if (!publicKeyObject) {
    throw new Error("Public key is required");
  }

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
