import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";

/**
 * E2EE envelope schema for encrypted payloads.
 */
const E2EEEnvelope = z.object({
  /** Base64url-encoded ephemeral public key from the sender */
  ephemeralPublicKey: z
    .string()
    .describe("Base64url-encoded ephemeral ECDH P-256 public key from mobile."),
  /** Base64url-encoded initialization vector (12 bytes for AES-GCM) */
  iv: z.string().describe("Base64url-encoded initialization vector."),
  /** Base64url-encoded ciphertext (includes authentication tag) */
  ciphertext: z.string().describe("Base64url-encoded encrypted payload."),
});

/**
 * Relay message types.
 */
const RelayMessageType = z.enum(["mrz", "nfc", "selfie"]);

/**
 * Store request schema for mobile uploads.
 */
const StoreRequest = z.object({
  /** Message type identifier */
  type: RelayMessageType.describe("Type of captured data."),
  /** Sequence number for ordering (monotonically increasing per attempt) */
  seq: z
    .number()
    .int()
    .min(0)
    .describe("Sequence number for message ordering."),
  /** Attempt ID this message belongs to */
  attempt_id: z.string().describe("The attempt ID this data belongs to."),
  /** E2EE encrypted payload (opaque to server) */
  e2ee: E2EEEnvelope.describe("End-to-end encrypted payload."),
});

export const storeDataInSession = createRoute({
  method: "post",
  path: "/sessions/{session_id}/store",
  request: {
    params: z.object({
      session_id: z
        .string()
        .describe("The verification session ID (e.g. vs_live_...)."),
    }),
    headers: z.object({
      authorization: z
        .string()
        .describe("Bearer token containing the mobile write token."),
    }),
    body: {
      content: {
        "application/json": {
          schema: StoreRequest.openapi("StoreDataRequest"),
        },
      },
    },
  },
  tags: ["Verification"],
  summary: "Store encrypted data from mobile in a verification session",
  description: `
Upload encrypted captured data (MRZ, NFC, or selfie) from the mobile device to
the relay. The data is end-to-end encrypted to the client's public key and
is opaque to the server.

Requires a valid mobile write token obtained from the bootstrap endpoint.
The token is passed in the Authorization header as a Bearer token.

The server will:
1. Validate the mobile write token
2. Forward the encrypted payload to connected clients via WebSocket
3. Return immediately (fire-and-forget)
`,
  responses: {
    202: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              delivered: z
                .number()
                .describe("Number of clients the message was delivered to."),
              timestamp: z
                .number()
                .describe("Server timestamp in Unix milliseconds."),
            }),
            error: z.null(),
          }),
        },
      },
      description: "Data accepted and forwarded to clients.",
    },
    401: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "UNAUTHORIZED",
                message: "Invalid or expired mobile write token.",
                hint: "Request a new token from the bootstrap endpoint.",
                docs: "https://kayle.id/docs/api/verification#store",
              },
            },
          }),
        },
      },
      description: "Invalid or expired mobile write token.",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Verification session not found.",
                hint: "The session with the given ID was not found.",
                docs: "https://kayle.id/docs/api/verification#store",
              },
            },
          }),
        },
      },
      description: "Verification session not found.",
    },
    500: {
      content: {
        "application/json": {
          schema: InternalServerErrorResponse,
        },
      },
      description: "Internal server error.",
    },
  },
});

export type StoreRequestType = z.infer<typeof StoreRequest>;
export type E2EEEnvelopeType = z.infer<typeof E2EEEnvelope>;
export type RelayMessageTypeType = z.infer<typeof RelayMessageType>;
