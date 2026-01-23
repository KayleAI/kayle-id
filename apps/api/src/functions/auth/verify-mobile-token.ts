import { env } from "@kayle-id/config/env";
import { PADDING_REGEX } from "@kayle-id/config/regex";
import { createHMAC } from "@/functions/hmac";

/**
 * Mobile write token payload structure.
 */
export type MobileWriteTokenPayload = {
  /** Session ID this token is valid for */
  sessionId: string;
  /** Attempt ID this token is valid for */
  attemptId: string;
  /** Token expiration timestamp (Unix milliseconds) */
  exp: number;
  /** Token issued at timestamp (Unix milliseconds) */
  iat: number;
};

/**
 * Mobile write token structure (payload + signature).
 */
export type MobileWriteToken = {
  /** Token payload */
  payload: MobileWriteTokenPayload;
  /** HMAC-SHA256 signature of the payload */
  sig: string;
};

/**
 * Default token TTL in milliseconds (5 minutes).
 */
const DEFAULT_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Generate a mobile write token for a verification session.
 *
 * The token is an HMAC-signed payload that allows mobile devices to
 * upload encrypted data to the relay for a specific session/attempt.
 *
 * @param sessionId - The verification session ID
 * @param attemptId - The attempt ID within the session
 * @param ttlMs - Token time-to-live in milliseconds (default: 5 minutes)
 * @returns The signed mobile write token
 */
export async function generateMobileWriteToken(
  sessionId: string,
  attemptId: string,
  ttlMs: number = DEFAULT_TOKEN_TTL_MS
): Promise<MobileWriteToken> {
  const now = Date.now();
  const payload: MobileWriteTokenPayload = {
    sessionId,
    attemptId,
    exp: now + ttlMs,
    iat: now,
  };

  const payloadString = JSON.stringify(payload);
  const sig = await createHMAC(payloadString, { secret: env.AUTH_SECRET });

  return { payload, sig };
}

/**
 * Serialize a mobile write token to a base64url string for QR code inclusion.
 *
 * @param token - The mobile write token
 * @returns Base64url-encoded token string
 */
export function serializeMobileWriteToken(token: MobileWriteToken): string {
  const jsonString = JSON.stringify(token);
  return btoa(jsonString)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(PADDING_REGEX, "");
}

/**
 * Deserialize a mobile write token from a base64url string.
 *
 * @param tokenString - Base64url-encoded token string
 * @returns The deserialized mobile write token, or null if invalid
 */
export function deserializeMobileWriteToken(
  tokenString: string
): MobileWriteToken | null {
  try {
    // Restore base64 padding
    const padded = tokenString.replace(/-/g, "+").replace(/_/g, "/");
    const paddedWithEquals = padded + "=".repeat((4 - (padded.length % 4)) % 4);
    const jsonString = atob(paddedWithEquals);
    return JSON.parse(jsonString) as MobileWriteToken;
  } catch {
    return null;
  }
}

/**
 * Result of mobile write token verification.
 */
export type VerifyMobileWriteTokenResult =
  | {
      valid: true;
      payload: MobileWriteTokenPayload;
    }
  | {
      valid: false;
      error:
        | "invalid_format"
        | "invalid_signature"
        | "expired"
        | "session_mismatch";
    };

/**
 * Verify a mobile write token.
 *
 * Checks:
 * 1. Token format is valid
 * 2. HMAC signature is valid
 * 3. Token has not expired
 * 4. Session ID matches (if provided)
 *
 * @param tokenString - The base64url-encoded token string
 * @param expectedSessionId - Optional session ID to validate against
 * @returns Verification result
 */
export async function verifyMobileWriteToken(
  tokenString: string,
  expectedSessionId?: string
): Promise<VerifyMobileWriteTokenResult> {
  // Deserialize the token
  const token = deserializeMobileWriteToken(tokenString);
  if (!token) {
    console.log("[verifyMobileWriteToken] Failed to deserialize token");
    return { valid: false, error: "invalid_format" };
  }

  // Verify HMAC signature
  const payloadString = JSON.stringify(token.payload);
  const expectedSig = await createHMAC(payloadString, {
    secret: env.AUTH_SECRET,
  });

  if (token.sig !== expectedSig) {
    console.log("[verifyMobileWriteToken] Signature mismatch:", {
      payloadString,
      tokenSig: token.sig,
      expectedSig,
      authSecretLength: env.AUTH_SECRET?.length ?? 0,
    });
    return { valid: false, error: "invalid_signature" };
  }

  // Check expiration
  if (token.payload.exp < Date.now()) {
    console.log("[verifyMobileWriteToken] Token expired:", {
      exp: token.payload.exp,
      now: Date.now(),
    });
    return { valid: false, error: "expired" };
  }

  // Check session ID if provided
  if (expectedSessionId && token.payload.sessionId !== expectedSessionId) {
    console.log("[verifyMobileWriteToken] Session mismatch:", {
      expected: expectedSessionId,
      actual: token.payload.sessionId,
    });
    return { valid: false, error: "session_mismatch" };
  }

  return { valid: true, payload: token.payload };
}

/**
 * Extract the bearer token from an Authorization header.
 *
 * @param authHeader - The Authorization header value
 * @returns The token string, or null if not a valid bearer token
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
