import type { RouteHandler } from "@hono/zod-openapi";
import type { cancelSession } from "@/openapi/v1/sessions/cancel-by-id";
import {
  cancelVerificationSession,
  getVerificationSessionById,
} from "@/v1/sessions/repo/session-repo";
import type { SessionsAppEnv } from "@/v1/sessions/types";

export const cancelSessionHandler: RouteHandler<
  typeof cancelSession,
  SessionsAppEnv
> = async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");

  const row = await getVerificationSessionById({
    id: params.id,
    organizationId,
  });

  if (!row) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Session not found.",
          hint: "The session with the given ID was not found.",
          docs: "https://kayle.id/docs/api/sessions#cancel-by-id",
        },
      },
      404
    );
  }

  if (!["completed", "expired", "cancelled"].includes(row.status)) {
    await cancelVerificationSession({ row, organizationId });
  }

  return c.body(null, 204);
};
