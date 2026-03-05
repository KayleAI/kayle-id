import { z } from "@hono/zod-openapi";
import { verificationAttemptFailureCodes } from "@kayle-id/database/schema/core";

export const RequestedShareField = z.object({
  required: z.boolean().describe("Whether this field is required by the RC."),
  reason: z
    .string()
    .min(1)
    .max(200)
    .describe("Human-readable reason for requesting this field."),
});

export const RequestedShareFields = z
  .record(z.string(), RequestedShareField)
  .describe("Requested share fields keyed by claim key.");

export const SessionShareField = z.object({
  required: z.boolean().describe("Whether this field must always be shared."),
  reason: z.string().describe("Reason shown to the user for this field."),
  source: z
    .enum(["default", "rc"])
    .describe("Whether the field came from defaults or RC request."),
});

export const SessionShareFields = z
  .record(z.string(), SessionShareField)
  .describe("Effective normalized share fields for this session.");

export const Attempt = z.object({
  id: z.string().describe("The ID of the verification attempt"),
  session_id: z
    .string()
    .describe("The ID of the verification session this attempt belongs to"),
  status: z
    .enum(["in_progress", "succeeded", "failed", "cancelled"])
    .describe("The status of the verification attempt"),
  failure_code: z
    .enum(verificationAttemptFailureCodes)
    .nullable()
    .describe("The code of the failure reason"),
  risk_score: z
    .number()
    .min(0)
    .max(1)
    .describe("The risk score of the verification attempt, between 0 and 1."),
  completed_at: z
    .string()
    .nullable()
    .describe(
      "The time the verification attempt reached a terminal state (i.e., succeeded, failed or cancelled)"
    ),
  created_at: z
    .string()
    .describe("The time the verification attempt was created"),
  updated_at: z
    .string()
    .describe("The time the verification attempt was last updated"),
});

export const Session = z
  .object({
    id: z.string().describe("The ID of the verification session"),
    environment: z
      .enum(["live", "test"])
      .describe("The environment this verification session belongs to."),
    status: z
      .enum(["created", "in_progress", "completed", "expired", "cancelled"])
      .describe("The status of the verification session"),
    contract_version: z
      .number()
      .int()
      .describe("Version of the session share contract."),
    share_fields: SessionShareFields.describe(
      "Effective normalized share fields used by this session."
    ),
    redirect_url: z
      .string()
      .nullable()
      .describe(
        "The URL to redirect to after the verification session is completed, if provided by the integrator."
      ),
    verification_url: z
      .string()
      .url()
      .describe(
        "The URL that the platform should send the user to in order to complete the verification."
      ),
    expires_at: z
      .string()
      .describe("The expiration time of the verification session"),
    completed_at: z
      .string()
      .nullable()
      .describe(
        "The time the verification session reached a terminal state (i.e., completed, expired or cancelled), or null if not yet terminal."
      ),
    created_at: z
      .string()
      .describe("The time the verification session was created"),
    updated_at: z
      .string()
      .describe("The time the verification session was last updated"),
    attempts: z
      .array(Attempt)
      .optional()
      .describe(
        "The verification attempts for the session. Only included when explicitly requested."
      ),
  })
  .openapi({
    examples: [
      {
        id: "vs_live_mza7vecksrtyfw193ekcvl5vnws3bt1lz96buu3iw7zidckf8dga2zx2echb3t16",
        environment: "live",
        status: "created",
        contract_version: 1,
        share_fields: {
          dg1_date_of_birth: {
            required: true,
            reason: "Needed to verify age eligibility",
            source: "rc",
          },
          kayle_document_id: {
            required: true,
            reason: 'Sharing "Kayle Document ID"',
            source: "default",
          },
        },
        redirect_url: "https://example.com/redirect",
        verification_url:
          "https://verify.kayle.id/vs_live_mza7vecksrtyfw193ekcvl5vnws3bt1lz96buu3iw7zidckf8dga2zx2echb3t16",
        expires_at: "2025-01-01T00:00:00Z",
        completed_at: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      },
    ],
  });
