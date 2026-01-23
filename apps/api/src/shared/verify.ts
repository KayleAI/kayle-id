import type { AttemptPhase } from "@kayle-id/config/e2ee-types";

/**
 * Message types for relay communication between mobile and client/browser.
 */
export type RelayMessageType = "mrz" | "nfc" | "selfie" | "phase";

/**
 * E2EE envelope structure for encrypted payloads.
 */
export type E2EEEnvelope = {
  /** Base64url-encoded ephemeral public key from the sender */
  ephemeralPublicKey: string;
  /** Base64url-encoded initialization vector */
  iv: string;
  /** Base64url-encoded ciphertext */
  ciphertext: string;
};

/**
 * Relay message format sent from mobile to client/browser via the Durable Object.
 */
export type RelayMessage = {
  /** Message type identifier */
  type: RelayMessageType;
  /** Sequence number for ordering */
  seq: number;
  /** Attempt ID this message belongs to */
  attemptId: string;
  /** E2EE encrypted payload (opaque to server) - not present for phase messages */
  e2ee?: E2EEEnvelope;
  /** Timestamp when the message was created */
  timestamp: number;
  /** Phase value - only present for phase messages */
  phase?: AttemptPhase;
  /** Error message - only present for phase messages with phase="error" */
  error?: string;
};

/**
 * Phase update request from mobile.
 */
export type PhaseUpdateRequest = {
  attemptId: string;
  phase: AttemptPhase;
  error?: string;
};
