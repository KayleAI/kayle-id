import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  extractBearerToken,
  verifyMobileWriteToken,
} from "@/functions/auth/verify-mobile-token";
import { storeDataInSession } from "@/openapi/v1/verify/store";
import type { RelayMessage } from "@/shared/verify";

/**
 * Register store endpoint (mobile upload).
 */
export function registerStoreRoute(
  app: OpenAPIHono<{ Bindings: CloudflareBindings }>
) {
  app.openapi(storeDataInSession, async (c) => {
    const { session_id: sessionId } = c.req.valid("param");
    const authHeader = c.req.header("authorization");
    const body = c.req.valid("json");

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
            docs: "https://kayle.id/docs/api/verification#store",
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
            docs: "https://kayle.id/docs/api/verification#store",
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
            docs: "https://kayle.id/docs/api/verification#store",
          },
        },
        401
      );
    }

    // Get the Durable Object for this session
    const doId = c.env.VERIFY_SESSION.idFromName(sessionId);
    const stub = c.env.VERIFY_SESSION.get(doId);

    // Build the relay message
    const relayMessage: RelayMessage = {
      type: body.type,
      seq: body.seq,
      attemptId: body.attempt_id,
      e2ee: body.e2ee,
      timestamp: Date.now(),
    };

    // Forward to the Durable Object for relay to desktop clients
    const relayResponse = await stub.fetch(
      new Request("https://internal/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(relayMessage),
      })
    );

    const relayResult = (await relayResponse.json()) as {
      success: boolean;
      deliveredCount?: number;
      timestamp?: number;
      error?: string;
    };

    if (!relayResult.success) {
      return c.json(
        {
          data: null,
          error: {
            code: "INTERNAL_SERVER_ERROR" as const,
            message: "Internal server error." as const,
            hint: "The server encountered an error." as const,
            docs: "https://kayle.id/docs/api/errors" as const,
          },
        },
        500
      );
    }

    return c.json(
      {
        data: {
          delivered: relayResult.deliveredCount ?? 0,
          timestamp: relayResult.timestamp ?? Date.now(),
        },
        error: null,
      },
      202
    );
  });
}
