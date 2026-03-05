import { OpenAPIHono } from "@hono/zod-openapi";
import { cancelSession } from "@/openapi/v1/sessions/cancel-by-id";
import { createSession } from "@/openapi/v1/sessions/create";
import { getSession } from "@/openapi/v1/sessions/get-by-id";
import { listSessions } from "@/openapi/v1/sessions/list";
import { cancelSessionHandler } from "@/v1/sessions/handlers/cancel-session";
import { createSessionHandler } from "@/v1/sessions/handlers/create-session";
import { createSessionValidationHook } from "@/v1/sessions/handlers/create-session-validation-hook";
import { getSessionHandler } from "@/v1/sessions/handlers/get-session";
import { listSessionsHandler } from "@/v1/sessions/handlers/list-sessions";
import type { SessionsAppEnv } from "@/v1/sessions/types";

const sessions = new OpenAPIHono<SessionsAppEnv>();

sessions.openapi(listSessions, listSessionsHandler);
sessions.openapi(
  createSession,
  createSessionHandler,
  createSessionValidationHook
);
sessions.openapi(getSession, getSessionHandler);
sessions.openapi(cancelSession, cancelSessionHandler);

export default sessions;
