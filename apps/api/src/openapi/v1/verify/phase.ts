import { createRoute, z } from "@hono/zod-openapi";
import { ErrorResponse } from "@/openapi/base";
import { InternalServerErrorResponse } from "../../errors";

/**
 * Attempt phase values
 */
const attemptPhaseSchema = z.enum([
  "initialized",
  "mobile_connected",
  "mrz_scanning",
  "mrz_complete",
  "nfc_reading",
  "nfc_complete",
  "selfie_capturing",
  "selfie_complete",
  "uploading",
  "complete",
  "error",
]);

/**
 * Update phase endpoint - called by mobile to update the current phase
 */
export const updatePhase = createRoute({
  operationId: "updatePhase",
  method: "post",
  path: "/sessions/{session_id}/phase",
  tags: ["Verification"],
  summary: "Update verification phase",
  description:
    "Update the current phase of a verification attempt. Called by mobile to notify desktop of progress.",
  request: {
    params: z.object({
      session_id: z.string().openapi({
        description: "The verification session ID",
        example: "vs_live_abc123",
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              attempt_id: z.string().openapi({
                description: "The verification attempt ID",
                example: "va_live_xyz789",
              }),
              phase: attemptPhaseSchema.openapi({
                description: "The current phase of the verification attempt",
                example: "mrz_scanning",
              }),
              error: z.string().optional().openapi({
                description: "Error message if phase is 'error'",
                example: "Camera permission denied",
              }),
            })
            .openapi("UpdatePhaseRequest"),
        },
      },
    },
    headers: z.object({
      authorization: z.string().openapi({
        description: "Bearer token with mobile write token",
        example: "Bearer eyJhbGciOiJIUzI1...",
      }),
    }),
  },
  responses: {
    200: {
      description: "Phase updated successfully",
      content: {
        "application/json": {
          schema: z
            .object({
              data: z
                .object({
                  phase: attemptPhaseSchema,
                  delivered: z.number().openapi({
                    description:
                      "Number of desktop clients that received the update",
                    example: 1,
                  }),
                  timestamp: z.number().openapi({
                    description: "Unix timestamp when the phase was updated",
                    example: 1_705_000_000_000,
                  }),
                })
                .nullable(),
              error: z.null(),
            })
            .openapi("UpdatePhaseResponse"),
        },
      },
    },
    401: {
      description: "Unauthorized - invalid or missing mobile write token",
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "UNAUTHORIZED",
                message: "Invalid or expired mobile write token.",
                hint: "Request a new token from the bootstrap endpoint.",
                docs: "https://kayle.id/docs/api/verification#updatephase",
              },
            },
          }),
        },
      },
    },
    404: {
      description: "Session not found",
      content: {
        "application/json": {
          schema: ErrorResponse.openapi({
            example: {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Verification session not found.",
                hint: "The session with the given ID was not found.",
                docs: "https://kayle.id/docs/api/verification#updatephase",
              },
            },
          }),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: InternalServerErrorResponse,
        },
      },
    },
  },
});
