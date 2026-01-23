import { OpenAPIHono } from "@hono/zod-openapi";
import { registerBootstrapRoute } from "./handlers/bootstrap";
import { registerCheckRoute } from "./handlers/check";
import { registerPhaseRoute } from "./handlers/phase";
import { registerStoreRoute } from "./handlers/store";
import { registerWebSocketRoutes } from "./handlers/websocket";

/**
 * Verify router - handles all verification-related endpoints.
 *
 * Endpoints:
 * - GET  /session/:id        - Legacy WebSocket RPC session
 * - GET  /ws/:sessionId      - Durable Object WebSocket
 * - POST /sessions/:id/bootstrap - Bootstrap verification attempt
 * - POST /sessions/:id/store     - Mobile data upload
 * - POST /sessions/:id/phase     - Mobile phase updates
 * - POST /sessions/:id/check     - Check verification result
 */
const verify = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

// Register all route handlers
registerWebSocketRoutes(verify);
registerBootstrapRoute(verify);
registerStoreRoute(verify);
registerPhaseRoute(verify);
registerCheckRoute(verify);

export default verify;
