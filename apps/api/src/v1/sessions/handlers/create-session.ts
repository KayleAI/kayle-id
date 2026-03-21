import type { RouteHandler } from "@hono/zod-openapi";
import { getRequestLogger } from "@/logging";
import type { createSession } from "@/openapi/v1/sessions/create";
import { generateId } from "@/utils/generate-id";
import { normalizeShareFields } from "@/v1/sessions/domain/share-contract/normalize-share-fields";
import { mapSessionRowToResponse } from "@/v1/sessions/mappers/session-response";
import { createVerificationSession } from "@/v1/sessions/repo/session-repo";
import type { SessionsAppEnv } from "@/v1/sessions/types";

const contractVersion = 1;

export const createSessionHandler: RouteHandler<
  typeof createSession,
  SessionsAppEnv
> = async (c) => {
  const organizationId = c.get("organizationId");
  const log = getRequestLogger(c);
  const query = c.req.valid("query") ?? {};
  const body = c.req.valid("json");

  const environment = c.get("environment");
  const redirectUrl = body?.redirect_url ?? null;

  const normalized = normalizeShareFields(body?.share_fields);
  if (!normalized.ok) {
    log.warn("sessions.create.validation_failed", {
      event: "sessions.create.validation_failed",
      organization_id: organizationId,
      error_code: normalized.error.code,
      status: normalized.error.status,
    });

    return c.json(
      {
        data: null,
        error: {
          code: normalized.error.code,
          message: normalized.error.message,
          hint: normalized.error.hint,
          docs: normalized.error.docs,
        },
      },
      normalized.error.status
    );
  }

  const id = generateId({ type: "vs", environment });
  const created = await createVerificationSession({
    id,
    organizationId,
    environment,
    redirectUrl,
    shareFields: normalized.shareFields,
    contractVersion,
  });

  log.set({
    event: "sessions.create.created",
    organization_id: organizationId,
    session_id: created.id,
    session_environment: created.environment,
    share_field_count: Object.keys(normalized.shareFields).length,
  });

  const data = mapSessionRowToResponse({
    row: created,
    attempts: query.include_attempts ? [] : undefined,
  });

  return c.json(
    {
      data,
      error: null,
    },
    200
  );
};
