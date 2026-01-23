/**
 * Client-side E2EE crypto utilities for the desktop browser.
 *
 * Uses WebCrypto API with ECDH P-256 + AES-256-GCM.
 */

import type { E2EEEnvelope } from "@kayle-id/config/e2ee-types";
import { PADDING_REGEX } from "@kayle-id/config/regex";

/**
 * ECDH P-256 keypair with base64url-encoded public key.
 */
export type ECDHKeypair = {
  /** Base64url-encoded SPKI public key */
  publicKey: string;
  /** CryptoKey object for the private key */
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
 * Generate an ephemeral ECDH P-256 keypair for this verification session.
 *
 * The private key never leaves the browser.
 *
 * @returns The keypair with base64url-encoded public key
 */
export async function generateEphemeralKeypair(): Promise<ECDHKeypair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true, // extractable (for public key export only)
    ["deriveBits"]
  );

  // Export public key as raw format (65 bytes: 0x04 + x + y)
  // This is compatible with CryptoKit's rawRepresentation
  const publicKeyBuffer = await crypto.subtle.exportKey(
    "raw",
    keyPair.publicKey
  );
  const publicKey = base64urlEncode(new Uint8Array(publicKeyBuffer));

  return {
    publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Import an ECDH P-256 public key from base64url-encoded raw format.
 */
// biome-ignore lint/suspicious/useAwait: it's okay
async function importECDHPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  const decoded = base64urlDecode(publicKeyB64);
  const publicKeyBytes = new Uint8Array(decoded);
  return crypto.subtle.importKey(
    "raw",
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
 * Derive an AES-256-GCM key from ECDH shared secret using HKDF.
 */
async function deriveAESKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  // Perform ECDH key agreement
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    256
  );

  // Import shared secret as HKDF key
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  // Derive AES-256-GCM key
  // Note: Using empty info to match CryptoKit's default HKDF behavior
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new Uint8Array(0), // Empty to match iOS CryptoKit
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
 * Decrypt an E2EE envelope using the desktop's private key.
 *
 * @param envelope - E2EE envelope from mobile
 * @param privateKey - Desktop's ECDH private key
 * @returns Decrypted data as Uint8Array
 * @throws Error if decryption or authentication fails
 */
export async function decryptBlob(
  envelope: E2EEEnvelope,
  privateKey: CryptoKey
): Promise<Uint8Array> {
  // Import sender's ephemeral public key
  const senderPublicKey = await importECDHPublicKey(
    envelope.ephemeralPublicKey
  );

  // Derive AES key from shared secret
  const aesKey = await deriveAESKey(privateKey, senderPublicKey);

  // Decode IV and ciphertext
  const ivDecoded = base64urlDecode(envelope.iv);
  const ciphertextDecoded = base64urlDecode(envelope.ciphertext);
  const iv = new Uint8Array(ivDecoded);
  const ciphertext = new Uint8Array(ciphertextDecoded);

  // Decrypt with AES-256-GCM
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
 * Decrypt an E2EE envelope and parse as JSON.
 *
 * @param envelope - E2EE envelope from mobile
 * @param privateKey - Desktop's ECDH private key
 * @returns Decrypted and parsed JSON data
 */
export async function decryptBlobAsJSON<T>(
  envelope: E2EEEnvelope,
  privateKey: CryptoKey
): Promise<T> {
  const plaintext = await decryptBlob(envelope, privateKey);
  const text = new TextDecoder().decode(plaintext);
  return JSON.parse(text) as T;
}

/**
 * Hook-friendly wrapper for keypair management.
 *
 * Use this in React components to manage the ephemeral keypair lifecycle.
 */
export class EphemeralKeypairManager {
  private keypair: ECDHKeypair | null = null;

  /**
   * Generate or return existing keypair.
   */
  async getOrCreateKeypair(): Promise<ECDHKeypair> {
    if (!this.keypair) {
      this.keypair = await generateEphemeralKeypair();
    }
    return this.keypair;
  }

  /**
   * Get the public key if keypair exists.
   */
  getPublicKey(): string | null {
    return this.keypair?.publicKey ?? null;
  }

  /**
   * Get the private key if keypair exists.
   */
  getPrivateKey(): CryptoKey | null {
    return this.keypair?.privateKey ?? null;
  }

  /**
   * Decrypt a blob using the stored private key.
   */
  async decrypt(envelope: E2EEEnvelope): Promise<Uint8Array> {
    if (!this.keypair) {
      throw new Error("No keypair available. Call getOrCreateKeypair first.");
    }
    return await decryptBlob(envelope, this.keypair.privateKey);
  }

  /**
   * Decrypt a blob and parse as JSON.
   */
  async decryptAsJSON<T>(envelope: E2EEEnvelope): Promise<T> {
    if (!this.keypair) {
      throw new Error("No keypair available. Call getOrCreateKeypair first.");
    }
    return await decryptBlobAsJSON<T>(envelope, this.keypair.privateKey);
  }

  /**
   * Reset the keypair (for retry flow).
   */
  reset(): void {
    this.keypair = null;
  }
}
