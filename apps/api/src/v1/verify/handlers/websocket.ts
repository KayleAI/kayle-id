import type { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "@kayle-id/database/drizzle";
import { verification_sessions } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import { validator } from "hono/validator";
import { z } from "zod";
import { sessionIdSchema } from "@/shared/validation";
import { webSocketErrorResponse } from "../utils";

/**
 * Register WebSocket routes.
 * Single /ws endpoint using native Durable Object WebSockets with hibernation.
 */
export function registerWebSocketRoutes(
  app: OpenAPIHono<{ Bindings: CloudflareBindings }>
) {
  // Native WebSocket endpoint - forwards to Durable Object
  // Client sends subscribe message after connection to receive notifications
  app.get(
    "/session/:id/ws",
    validator("param", (value) => {
      const parsed = z.object({ id: sessionIdSchema }).safeParse(value);

      if (!parsed.success) {
        return webSocketErrorResponse({
          code: "INVALID_SESSION_ID",
        });
      }

      return parsed.data;
    }),
    async (c) => {
      const { id } = c.req.valid("param");

      // Validate the session exists and is valid
      const [session] = await db
        .select({
          id: verification_sessions.id,
          organizationId: verification_sessions.organizationId,
          environment: verification_sessions.environment,
          status: verification_sessions.status,
          redirectUrl: verification_sessions.redirectUrl,
          expiresAt: verification_sessions.expiresAt,
          completedAt: verification_sessions.completedAt,
          createdAt: verification_sessions.createdAt,
          updatedAt: verification_sessions.updatedAt,
        })
        .from(verification_sessions)
        .where(eq(verification_sessions.id, id))
        .limit(1);

      if (!session) {
        return webSocketErrorResponse({
          code: "SESSION_NOT_FOUND",
        });
      }

      if (
        ["expired", "cancelled", "completed"].includes(session.status) ||
        session.expiresAt.getTime() < Date.now()
      ) {
        return webSocketErrorResponse({
          code: "SESSION_EXPIRED",
        });
      }

      if (session.status === "in_progress") {
        return webSocketErrorResponse({
          code: "SESSION_IN_PROGRESS",
        });
      }

      // Get the Durable Object for this session
      const doId = c.env.VERIFY_SESSION.idFromName(id);
      const stub = c.env.VERIFY_SESSION.get(doId);

      // Create a new request with session data in headers
      const headers = new Headers(c.req.raw.headers);
      headers.set("X-Session-Data", JSON.stringify(session));

      // Forward to /ws endpoint on the Durable Object
      const doUrl = new URL(c.req.url);
      doUrl.pathname = "/ws";

      const doRequest = new Request(doUrl.toString(), {
        method: c.req.raw.method,
        headers,
      });

      // Forward the WebSocket upgrade to the Durable Object
      return stub.fetch(doRequest);
    }
  );
}
