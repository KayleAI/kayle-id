import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";

/**
 * Bootstrap response schema for QR code generation.
 */
const BootstrapResponse = z.object({
  /** The verification session ID */
  session_id: z.string().describe("The verification session ID."),
  /** The attempt ID for this verification attempt */
  attempt_id: z
    .string()
    .describe("The attempt ID for this verification attempt."),
  /** Base64url-encoded mobile write token (HMAC-signed) */
  mobile_write_token: z
    .string()
    .describe("Base64url-encoded mobile write token for uploading data."),
  /** Token expiration timestamp (Unix milliseconds) */
  token_exp: z
    .number()
    .describe("Token expiration timestamp in Unix milliseconds."),
  /** Crypto version for E2EE envelope compatibility */
  crypto_version: z
    .literal("ecdh-p256-aes256gcm-v1")
    .describe("Cryptographic protocol version."),
  /** Server signature over the QR payload fields for anti-tampering */
  sig: z
    .string()
    .describe("Server signature over the QR payload for verification."),
});

export const bootstrapSession = createRoute({
  method: "post",
  path: "/sessions/{session_id}/bootstrap",
  request: {
    params: z.object({
      session_id: z
        .string()
        .describe("The verification session ID (e.g. vs_live_...)."),
    }),
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              client_public_key: z
                .string()
                .describe(
                  "Base64url-encoded ECDH P-256 public key from the client/browser."
                ),
            })
            .openapi("BootstrapRequest"),
        },
      },
    },
  },
  tags: ["Verification"],
  summary: "Bootstrap a verification session for QR code generation",
  description: `
Mints a mobile write token and returns all the data needed to generate a QR code
for mobile handoff. The client/browser should call this endpoint after generating
an ephemeral ECDH keypair.

The response contains:
- A short-lived mobile write token (5 minute TTL)
- Server signature for anti-tampering verification

The client should render a QR code containing:
- session_id
- attempt_id  
- mobile_write_token
- client_public_key (from request)
- crypto_version
- sig
`,
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: BootstrapResponse,
            error: z.null(),
          }),
        },
      },
      description: "Bootstrap data for QR code generation.",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "BAD_REQUEST",
                message: "Invalid client public key.",
                hint: "The public key must be a valid base64url-encoded ECDH P-256 public key.",
                docs: "https://kayle.id/docs/api/verification#bootstrap",
              },
            },
          }),
        },
      },
      description: "Invalid request.",
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
                docs: "https://kayle.id/docs/api/verification#bootstrap",
              },
            },
          }),
        },
      },
      description: "Verification session not found.",
    },
    409: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "CONFLICT",
                message: "Session is not in a valid state for bootstrap.",
                hint: "The session may have expired, been cancelled, or already completed.",
                docs: "https://kayle.id/docs/api/verification#bootstrap",
              },
            },
          }),
        },
      },
      description: "Session is not in a valid state.",
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

export type BootstrapResponseType = z.infer<typeof BootstrapResponse>;
