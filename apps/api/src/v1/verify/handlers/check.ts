import type { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import { verification_sessions } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import { checkVerification } from "@/openapi/v1/verify/check";
import { verificationService } from "@/services/verification";

/**
 * Register check verification endpoint.
 */
export function registerCheckRoute(
  app: OpenAPIHono<{ Bindings: CloudflareBindings }>
) {
  app.openapi(checkVerification, async (c) => {
    const { session_id: sessionId } = c.req.valid("param");
    const body = c.req.valid("json");

    // Validate the session exists
    const [session] = await db
      .select({
        id: verification_sessions.id,
        status: verification_sessions.status,
      })
      .from(verification_sessions)
      .where(eq(verification_sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return c.json(
        {
          data: null,
          error: {
            code: "NOT_FOUND" as const,
            message: "Verification session not found.",
            hint: "The session with the given ID was not found.",
            docs: "https://kayle.id/docs/api/verification#check",
          },
        },
        404
      );
    }

    // Validate request data
    if (!body.document_photo || body.document_photo.length < 100) {
      return c.json(
        {
          data: null,
          error: {
            code: "BAD_REQUEST" as const,
            message: "Invalid document photo.",
            hint: "The document_photo must be a valid base64-encoded image.",
            docs: "https://kayle.id/docs/api/verification#check",
          },
        },
        400
      );
    }

    if (!body.selfie_image || body.selfie_image.length < 100) {
      return c.json(
        {
          data: null,
          error: {
            code: "BAD_REQUEST" as const,
            message: "Invalid selfie image.",
            hint: "The selfie_image must be a valid base64-encoded image.",
            docs: "https://kayle.id/docs/api/verification#check",
          },
        },
        400
      );
    }

    // Perform verification
    const result = await verificationService.verify(
      body.document_photo,
      body.selfie_image
    );

    return c.json(
      {
        data: {
          passed: result.passed,
          liveness_score: result.livenessScore,
          match_score: result.matchScore,
          codes: result.codes,
        },
        error: null,
      },
      200
    );
  });
}
