/**
 * End-to-End Encryption utilities using ECDH P-256 + AES-256-GCM.
 *
 * This module provides functions for:
 * - Generating ephemeral ECDH P-256 keypairs
 * - Performing ECDH key agreement
 * - Encrypting/decrypting data with AES-256-GCM
 *
 * The encryption scheme uses:
 * - ECDH with P-256 curve for key exchange
 * - HKDF-SHA256 for key derivation
 * - AES-256-GCM for authenticated encryption
 *
 * All binary data is encoded as base64url for transport.
 */

import { PADDING_REGEX } from "@kayle-id/config/regex";

/**
 * E2EE envelope structure for encrypted payloads.
 */
export type E2EEEnvelope = {
  /** Base64url-encoded ephemeral public key from the sender */
  ephemeralPublicKey: string;
  /** Base64url-encoded initialization vector (12 bytes) */
  iv: string;
  /** Base64url-encoded ciphertext (includes authentication tag) */
  ciphertext: string;
};

/**
 * ECDH P-256 keypair with base64url-encoded keys.
 */
export type ECDHKeypair = {
  /** Base64url-encoded SPKI public key */
  publicKey: string;
  /** CryptoKey object for the private key (not exportable) */
  privateKey: CryptoKey;
};

/**
 * Encode a Uint8Array to base64url string.
 */
export function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(PADDING_REGEX, "");
}

/**
 * Decode a base64url string to Uint8Array.
 */
export function base64urlDecode(str: string): Uint8Array {
  // Restore base64 padding and characters
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(paddedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate an ephemeral ECDH P-256 keypair.
 *
 * @returns The keypair with base64url-encoded public key
 */
export async function generateECDHKeypair(): Promise<ECDHKeypair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true, // extractable (for public key export)
    ["deriveBits"]
  );

  // Export public key as SPKI
  const publicKeyBuffer = await crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey
  );
  const publicKey = base64urlEncode(new Uint8Array(publicKeyBuffer));

  return {
    publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Import an ECDH P-256 public key from base64url-encoded SPKI.
 *
 * @param publicKeyB64 - Base64url-encoded SPKI public key
 * @returns The imported CryptoKey
 */
// biome-ignore lint/suspicious/useAwait: it's okay
export async function importECDHPublicKey(
  publicKeyB64: string
): Promise<CryptoKey> {
  const publicKeyBytes = base64urlDecode(publicKeyB64);
  return crypto.subtle.importKey(
    "spki",
    publicKeyBytes,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    []
  );
}

/**
 * Derive a shared secret using ECDH and then derive an AES key using HKDF.
 *
 * @param privateKey - The local ECDH private key
 * @param publicKey - The remote ECDH public key
 * @param salt - Optional salt for HKDF (defaults to empty)
 * @param info - Optional info for HKDF (defaults to "e2ee-aes-key")
 * @returns AES-256-GCM key derived from the shared secret
 */
export async function deriveAESKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  salt?: Uint8Array,
  info?: Uint8Array
): Promise<CryptoKey> {
  // Perform ECDH key agreement
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    256 // P-256 produces 256-bit shared secret
  );

  // Import shared secret as HKDF key
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  // Derive AES-256-GCM key using HKDF
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt ?? new Uint8Array(0),
      info: info ?? new TextEncoder().encode("e2ee-aes-key"),
    },
    hkdfKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt data using ECDH P-256 + AES-256-GCM.
 *
 * This function:
 * 1. Generates an ephemeral ECDH keypair
 * 2. Derives a shared secret with the recipient's public key
 * 3. Derives an AES-256-GCM key from the shared secret
 * 4. Encrypts the plaintext with a random IV
 *
 * @param plaintext - Data to encrypt (string or Uint8Array)
 * @param recipientPublicKeyB64 - Base64url-encoded SPKI public key of recipient
 * @returns E2EE envelope containing encrypted data
 */
export async function encryptE2EE(
  plaintext: string | Uint8Array,
  recipientPublicKeyB64: string
): Promise<E2EEEnvelope> {
  // Convert string to bytes if needed
  const plaintextBytes =
    typeof plaintext === "string"
      ? new TextEncoder().encode(plaintext)
      : plaintext;

  // Generate ephemeral keypair
  const ephemeral = await generateECDHKeypair();

  // Import recipient's public key
  const recipientPublicKey = await importECDHPublicKey(recipientPublicKeyB64);

  // Derive AES key from shared secret
  const aesKey = await deriveAESKey(ephemeral.privateKey, recipientPublicKey);

  // Generate random 12-byte IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt with AES-256-GCM
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    plaintextBytes
  );

  return {
    ephemeralPublicKey: ephemeral.publicKey,
    iv: base64urlEncode(iv),
    ciphertext: base64urlEncode(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypt data using ECDH P-256 + AES-256-GCM.
 *
 * This function:
 * 1. Imports the sender's ephemeral public key
 * 2. Derives the shared secret with the recipient's private key
 * 3. Derives the AES-256-GCM key from the shared secret
 * 4. Decrypts and authenticates the ciphertext
 *
 * @param envelope - E2EE envelope containing encrypted data
 * @param recipientPrivateKey - The recipient's ECDH private key
 * @returns Decrypted data as Uint8Array
 * @throws Error if decryption or authentication fails
 */
export async function decryptE2EE(
  envelope: E2EEEnvelope,
  recipientPrivateKey: CryptoKey
): Promise<Uint8Array> {
  // Import sender's ephemeral public key
  const senderPublicKey = await importECDHPublicKey(
    envelope.ephemeralPublicKey
  );

  // Derive AES key from shared secret
  const aesKey = await deriveAESKey(recipientPrivateKey, senderPublicKey);

  // Decode IV and ciphertext
  const iv = base64urlDecode(envelope.iv);
  const ciphertext = base64urlDecode(envelope.ciphertext);

  // Decrypt with AES-256-GCM (includes authentication)
  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    aesKey,
    ciphertext
  );

  return new Uint8Array(plaintextBuffer);
}

/**
 * Decrypt data and return as string.
 *
 * @param envelope - E2EE envelope containing encrypted data
 * @param recipientPrivateKey - The recipient's ECDH private key
 * @returns Decrypted data as UTF-8 string
 */
export async function decryptE2EEToString(
  envelope: E2EEEnvelope,
  recipientPrivateKey: CryptoKey
): Promise<string> {
  const plaintext = await decryptE2EE(envelope, recipientPrivateKey);
  return new TextDecoder().decode(plaintext);
}
