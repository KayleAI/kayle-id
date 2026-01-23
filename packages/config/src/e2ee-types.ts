/**
 * Shared E2EE types for the Kayle ID verification system.
 *
 * These types are used across:
 * - API (relay server)
 * - Verify app (client/browser frontend)
 * - Mobile SDKs (iOS/Android)
 */

/**
 * Crypto version identifier for the E2EE protocol.
 * This ensures compatibility between mobile and client/browser clients.
 */
export const CRYPTO_VERSION = "ecdh-p256-aes256gcm-v1" as const;
export type CryptoVersion = typeof CRYPTO_VERSION;

/**
 * E2EE envelope structure for encrypted payloads.
 *
 * This envelope is created by the mobile app and decrypted by the client/browser.
 * The server (relay) only sees opaque ciphertext.
 */
export type E2EEEnvelope = {
  /** Base64url-encoded ephemeral ECDH P-256 public key from the sender */
  ephemeralPublicKey: string;
  /** Base64url-encoded initialization vector (12 bytes for AES-GCM) */
  iv: string;
  /** Base64url-encoded ciphertext (includes GCM authentication tag) */
  ciphertext: string;
};

/**
 * Attempt phase represents the current state of a verification attempt on mobile.
 * This is used to track progress and update the client/browser UI in real-time.
 */
export type AttemptPhase =
  | "initialized" // QR generated, waiting for mobile to scan
  | "mobile_connected" // Mobile scanned QR and connected
  | "mrz_scanning" // User scanning passport MRZ
  | "mrz_complete" // MRZ captured successfully
  | "nfc_reading" // NFC chip being read
  | "nfc_complete" // NFC data captured
  | "selfie_capturing" // User taking selfie
  | "selfie_complete" // Selfie captured
  | "uploading" // Data being uploaded to relay
  | "complete" // All data received by client/browser
  | "error" // Error occurred
  | "expired" // Attempt expired (client disconnected or timed out)
  | "client_disconnected"; // Client disconnected during verification

/**
 * Relay message types for mobile-to-client/browser communication.
 */
export type RelayMessageType = "mrz" | "nfc" | "selfie" | "phase";

/**
 * Phase message sent from mobile to update the client/browser on progress.
 * Unlike other relay messages, phase messages are NOT encrypted since
 * they contain no sensitive data - just status information.
 */
export type PhaseMessage = {
  type: "phase";
  attemptId: string;
  phase: AttemptPhase;
  timestamp: number;
  /** Optional error message if phase is "error" */
  error?: string;
};

/**
 * Relay message structure sent through the Durable Object.
 */
export type RelayMessage = {
  /** Message type identifier */
  type: RelayMessageType;
  /** Sequence number for ordering (monotonically increasing per attempt) */
  seq: number;
  /** Attempt ID this message belongs to */
  attemptId: string;
  /** E2EE encrypted payload (opaque to server) - not present for phase messages */
  e2ee?: E2EEEnvelope;
  /** Timestamp when the message was created (Unix milliseconds) */
  timestamp: number;
  /** Phase value - only present for phase messages */
  phase?: AttemptPhase;
  /** Error message - only present for phase messages with phase="error" */
  error?: string;
};

/**
 * QR code payload structure for mobile handoff.
 *
 * This is what the client/browser renders in the QR code and the mobile app scans.
 */
export type QRCodePayload = {
  /** Verification session ID */
  session_id: string;
  /** Attempt ID for this verification attempt */
  attempt_id: string;
  /** Base64url-encoded mobile write token */
  mobile_write_token: string;
  /** Base64url-encoded client ECDH P-256 public key */
  client_public_key: string;
  /** Crypto version for compatibility checking */
  crypto_version: CryptoVersion;
  /** Token expiration timestamp (Unix milliseconds) */
  token_exp: number;
  /** Server signature over the payload for anti-tampering */
  sig: string;
};

/**
 * Bootstrap response from the API.
 */
export type BootstrapResponse = Omit<QRCodePayload, "client_public_key">;

/**
 * Decrypted MRZ data structure.
 */
export type DecryptedMRZData = {
  /** Raw MRZ string (2 or 3 lines) */
  raw: string;
  /** Parsed MRZ fields */
  parsed: {
    /** Document type (P for passport, etc.) */
    documentType: string;
    /** Issuing country (3-letter code) */
    issuingCountry: string;
    /** Surname */
    surname: string;
    /** Given names */
    givenNames: string;
    /** Document number */
    documentNumber: string;
    /** Nationality (3-letter code) */
    nationality: string;
    /** Date of birth (YYMMDD) */
    dateOfBirth: string;
    /** Sex (M/F/<) */
    sex: string;
    /** Expiry date (YYMMDD) */
    expiryDate: string;
    /** Optional data / personal number */
    optionalData?: string;
  };
  /** MRZ check digit validation results */
  checks: {
    /** Document number check digit valid */
    documentNumber: boolean;
    /** Date of birth check digit valid */
    dateOfBirth: boolean;
    /** Expiry date check digit valid */
    expiryDate: boolean;
    /** Composite check digit valid (if applicable) */
    composite?: boolean;
  };
};

/**
 * Decrypted NFC data structure.
 */
export type DecryptedNFCData = {
  /** Data Group 1 (MRZ info from chip) */
  dg1?: {
    /** Raw DG1 bytes as base64url */
    raw: string;
  };
  /** Data Group 2 (Face image) */
  dg2: {
    /** Raw DG2 bytes as base64url */
    raw: string;
    /** Extracted face image as base64url JPEG */
    faceImage?: string;
  };
  /** Security Object Document for Passive Authentication */
  sod: {
    /** Raw SOD bytes as base64url */
    raw: string;
  };
  /** Passive Authentication result (if performed on-device) */
  passiveAuth?: {
    /** Whether PA was performed */
    performed: boolean;
    /** Whether PA succeeded */
    valid: boolean;
    /** Certificate chain validation result */
    certChainValid?: boolean;
  };
};

/**
 * Decrypted selfie data structure.
 */
export type DecryptedSelfieData = {
  /** Selfie image as base64url JPEG */
  image: string;
  /** Image dimensions */
  dimensions: {
    width: number;
    height: number;
  };
  /** Capture timestamp */
  capturedAt: number;
  /** Device-side face detection result */
  faceDetected?: boolean;
};

/**
 * Status message for progress updates.
 * @deprecated Use PhaseMessage instead
 */
export type StatusMessage = {
  /** Current step in the capture flow */
  step: "mrz_scanning" | "nfc_reading" | "selfie_capturing" | "complete";
  /** Progress percentage (0-100) */
  progress?: number;
  /** Error message if any */
  error?: string;
};
