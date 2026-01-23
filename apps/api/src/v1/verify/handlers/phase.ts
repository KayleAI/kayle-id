import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  extractBearerToken,
  verifyMobileWriteToken,
} from "@/functions/auth/verify-mobile-token";
import { updatePhase } from "@/openapi/v1/verify/phase";

/**
 * Register phase update endpoint (mobile progress).
 */
export function registerPhaseRoute(
  app: OpenAPIHono<{ Bindings: CloudflareBindings }>
) {
  app.openapi(updatePhase, async (c) => {
    const { session_id: sessionId } = c.req.valid("param");
    const authHeader = c.req.header("authorization");
    const body = c.req.valid("json");

    console.log("[Phase] Received phase update request:", {
      sessionId,
      attemptId: body.attempt_id,
      phase: body.phase,
    });

    // Extract and verify mobile write token
    const tokenString = extractBearerToken(authHeader ?? null);
    if (!tokenString) {
      return c.json(
        {
          data: null,
          error: {
            code: "UNAUTHORIZED" as const,
            message: "Missing or invalid Authorization header.",
            hint: "Include a Bearer token with the mobile write token.",
            docs: "https://kayle.id/docs/api/verification#phase",
          },
        },
        401
      );
    }

    const tokenResult = await verifyMobileWriteToken(tokenString, sessionId);
    if (!tokenResult.valid) {
      return c.json(
        {
          data: null,
          error: {
            code: "UNAUTHORIZED" as const,
            message: `Invalid mobile write token: ${tokenResult.error}`,
            hint: "Request a new token from the bootstrap endpoint.",
            docs: "https://kayle.id/docs/api/verification#phase",
          },
        },
        401
      );
    }

    // Verify attempt ID matches
    if (tokenResult.payload.attemptId !== body.attempt_id) {
      return c.json(
        {
          data: null,
          error: {
            code: "UNAUTHORIZED" as const,
            message: "Attempt ID mismatch.",
            hint: "The attempt ID in the request does not match the token.",
            docs: "https://kayle.id/docs/api/verification#phase",
          },
        },
        401
      );
    }

    // Get the Durable Object for this session
    const doId = c.env.VERIFY_SESSION.idFromName(sessionId);
    const stub = c.env.VERIFY_SESSION.get(doId);

    // Forward to the Durable Object for phase update and broadcast
    const phaseResponse = await stub.fetch(
      new Request("https://internal/phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: body.attempt_id,
          phase: body.phase,
          error: body.error,
        }),
      })
    );

    const phaseResult = (await phaseResponse.json()) as {
      success: boolean;
      phase?: string;
      deliveredCount?: number;
      timestamp?: number;
      error?: string;
    };

    if (!phaseResult.success) {
      console.log("[Phase] DO returned failure:", phaseResult.error);
      return c.json(
        {
          data: null,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error.",
            hint: "The server encountered an error.",
            docs: "https://kayle.id/docs/api/errors",
          },
        } as const,
        500
      );
    }

    console.log("[Phase] Phase update successful:", {
      phase: body.phase,
      delivered: phaseResult.deliveredCount,
    });

    return c.json(
      {
        data: {
          phase: body.phase,
          delivered: phaseResult.deliveredCount ?? 0,
          timestamp: phaseResult.timestamp ?? Date.now(),
        },
        error: null,
      },
      200
    );
  });
}
