import type { OpenAPIHono } from "@hono/zod-openapi";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import {
  generateMobileWriteToken,
  serializeMobileWriteToken,
} from "@/functions/auth/verify-mobile-token";
import { createHMAC } from "@/functions/hmac";
import { bootstrapSession } from "@/openapi/v1/verify/bootstrap";
import { generateId } from "@/utils/generate-id";
import { CRYPTO_VERSION } from "../constants";

/**
 * Register bootstrap endpoint.
 */
export function registerBootstrapRoute(
  app: OpenAPIHono<{ Bindings: CloudflareBindings }>
) {
  app.openapi(bootstrapSession, async (c) => {
    const { session_id: sessionId } = c.req.valid("param");
    const { client_public_key: clientPublicKey } = c.req.valid("json");

    // Validate the session exists and is in a valid state
    const [session] = await db
      .select({
        id: verification_sessions.id,
        organizationId: verification_sessions.organizationId,
        environment: verification_sessions.environment,
        status: verification_sessions.status,
        expiresAt: verification_sessions.expiresAt,
      })
      .from(verification_sessions)
      .where(eq(verification_sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return c.json(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Verification session not found.",
            hint: "The session with the given ID was not found.",
            docs: "https://kayle.id/docs/api/verification#bootstrap",
          },
        },
        404
      );
    }

    // Check session state
    if (
      ["expired", "cancelled", "completed"].includes(session.status) ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return c.json(
        {
          data: null,
          error: {
            code: "CONFLICT",
            message: "Session is not in a valid state for bootstrap.",
            hint: "The session may have expired, been cancelled, or already completed.",
            docs: "https://kayle.id/docs/api/verification#bootstrap",
          },
        },
        409
      );
    }

    // Create a new attempt for this bootstrap
    const environment = session.environment as "live" | "test";
    const attemptId = generateId({ type: "va", environment });

    // Insert the attempt record
    await db.insert(verification_attempts).values({
      id: attemptId,
      verificationSessionId: sessionId,
      status: "in_progress",
    });

    // Generate mobile write token
    const token = await generateMobileWriteToken(sessionId, attemptId);
    const mobileWriteToken = serializeMobileWriteToken(token);

    // Build the QR payload fields for signing
    const qrPayload = {
      session_id: sessionId,
      attempt_id: attemptId,
      mobile_write_token: mobileWriteToken,
      client_public_key: clientPublicKey,
      crypto_version: CRYPTO_VERSION,
      token_exp: token.payload.exp,
    };

    // Sign the QR payload
    const payloadString = JSON.stringify(qrPayload);
    const sig = await createHMAC(payloadString, { secret: env.AUTH_SECRET });

    // Store bootstrap data in the Durable Object for secure broadcasting
    const doId = c.env.VERIFY_SESSION.idFromName(sessionId);
    const stub = c.env.VERIFY_SESSION.get(doId);

    const bootstrapUrl = new URL(c.req.url);
    bootstrapUrl.pathname = "/bootstrap";

    await stub.fetch(bootstrapUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId,
        clientPublicKey,
        mobileWriteToken,
      }),
    });

    return c.json(
      {
        data: {
          session_id: sessionId,
          attempt_id: attemptId,
          mobile_write_token: mobileWriteToken,
          token_exp: token.payload.exp,
          crypto_version: CRYPTO_VERSION,
          sig,
        },
        error: null,
      },
      200
    );
  });
}
