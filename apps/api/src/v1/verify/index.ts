import { type Context, Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { sessionIdSchema } from "@/shared/validation";
import { createVerifyJsonErrorResponse } from "./error-response";
import { issueHandoffPayload } from "./handoff";
import { loadActiveVerifySession } from "./session-context";
import { getPublicVerifySessionStatus } from "./session-status";
import { startVerifySocketSession } from "./socket-controller";
import { webSocketErrorResponse } from "./utils";
import { configureVerifyAssetFetcherFromEnv } from "./verify-assets";

const verify = new Hono<{ Bindings: CloudflareBindings }>();
const sessionParamSchema = z.object({ id: sessionIdSchema });

function validateSessionParam(
  value: unknown
): z.infer<typeof sessionParamSchema> | null {
  const parsed = sessionParamSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function sessionParamJsonValidator(value: unknown, c: Context) {
  const parsed = validateSessionParam(value);

  if (parsed) {
    return parsed;
  }

  const response = createVerifyJsonErrorResponse({
    code: "INVALID_SESSION_ID",
    status: 400,
  });

  return c.json(
    {
      data: response.data,
      error: response.error,
    },
    response.status
  );
}

verify.post(
  "/session/:id/handoff",
  validator("param", sessionParamJsonValidator),
  async (c) => {
    const { id } = c.req.valid("param");
    const handoff = await issueHandoffPayload(id);

    if (!handoff.ok) {
      const response = createVerifyJsonErrorResponse({
        code: handoff.error.code,
        status: handoff.error.status,
      });

      return c.json(
        {
          data: response.data,
          error: response.error,
        },
        response.status
      );
    }

    return c.json(
      {
        data: handoff.data,
        error: null,
      },
      200
    );
  }
);

verify.get(
  "/session/:id/status",
  validator("param", sessionParamJsonValidator),
  async (c) => {
    const { id } = c.req.valid("param");
    const status = await getPublicVerifySessionStatus({
      sessionId: id,
    });

    if (!status) {
      const response = createVerifyJsonErrorResponse({
        code: "SESSION_NOT_FOUND",
        status: 404,
      });

      return c.json(
        {
          data: response.data,
          error: response.error,
        },
        response.status
      );
    }

    return c.json(
      {
        data: status,
        error: null,
      },
      200
    );
  }
);

verify.get(
  "/session/:id",
  validator("param", (value) => {
    const parsed = validateSessionParam(value);

    if (!parsed) {
      return webSocketErrorResponse({
        code: "INVALID_SESSION_ID",
      });
    }

    return parsed;
  }),
  async (c) => {
    configureVerifyAssetFetcherFromEnv(c.env);

    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
      return c.json(
        {
          error: {
            code: "WEBSOCKET_REQUIRED",
            message: "This endpoint requires a WebSocket connection.",
          },
        },
        426
      );
    }

    const activeSession = await loadActiveVerifySession(
      c.req.valid("param").id
    );

    if (!activeSession.ok) {
      return webSocketErrorResponse({
        code: activeSession.code,
      });
    }

    return startVerifySocketSession(c, activeSession.value);
  }
);

export default verify;
