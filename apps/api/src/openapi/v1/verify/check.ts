import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "@/openapi/errors";

/**
 * Verification check request schema.
 */
const CheckRequest = z.object({
  /** Base64-encoded document photo from DG2 */
  document_photo: z
    .string()
    .describe("Base64-encoded document photo extracted from DG2."),
  /** Base64-encoded selfie image */
  selfie_image: z.string().describe("Base64-encoded selfie image."),
});

/**
 * Verification check response schema.
 */
const CheckResponse = z.object({
  /** Overall pass/fail result */
  passed: z.boolean().describe("Whether the verification passed."),
  /** Liveness check score (0-1) */
  liveness_score: z
    .number()
    .min(0)
    .max(1)
    .describe("Liveness detection confidence score."),
  /** Face match score (0-1) */
  match_score: z
    .number()
    .min(0)
    .max(1)
    .describe("Face matching similarity score."),
  /** Failure reason codes */
  codes: z
    .array(z.string())
    .describe("Array of failure reason codes, empty if passed."),
});

export const checkVerification = createRoute({
  method: "post",
  path: "/sessions/{session_id}/check",
  request: {
    params: z.object({
      session_id: z
        .string()
        .describe("The verification session ID (e.g. vs_live_...)."),
    }),
    body: {
      content: {
        "application/json": {
          schema: CheckRequest.openapi("CheckVerificationRequest"),
        },
      },
    },
  },
  tags: ["Verification"],
  summary: "Perform liveness and face match verification",
  description: `
Perform liveness detection and face matching verification.

The desktop browser sends the decrypted document photo (from NFC DG2) and
selfie image to this endpoint after receiving all data from mobile.

The server performs:
1. Liveness detection on the selfie
2. Face matching between document photo and selfie

Returns a combined result with scores and any failure codes.
`,
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: CheckResponse,
            error: z.null(),
          }),
        },
      },
      description: "Verification result.",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "BAD_REQUEST",
                message: "Invalid image data.",
                hint: "Both document_photo and selfie_image must be valid base64-encoded images.",
                docs: "https://kayle.id/docs/api/verification#check",
              },
            },
          }),
        },
      },
      description: "Invalid request data.",
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
                docs: "https://kayle.id/docs/api/verification#check",
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

export type CheckRequestType = z.infer<typeof CheckRequest>;
export type CheckResponseType = z.infer<typeof CheckResponse>;
