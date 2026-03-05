import type { Hook, RouteConfigToTypedResponse } from "@hono/zod-openapi";
import type { ZodIssue } from "zod";
import type { createSession } from "@/openapi/v1/sessions/create";
import type { SessionsAppEnv } from "@/v1/sessions/types";

const docs = "https://kayle.id/docs/api/sessions#create";

const errorCatalog = {
  INVALID_SHARE_FIELDS: {
    message: "Invalid share_fields payload.",
    hint: "share_fields must be an object map of claim keys.",
  },
  REASON_REQUIRED: {
    message: "Each share field requires a reason.",
    hint: "Provide a non-empty reason for every requested claim.",
  },
  REASON_TOO_LONG: {
    message: "Reason is too long.",
    hint: "Reason must be 200 characters or fewer.",
  },
} as const;

type HookErrorCode = keyof typeof errorCatalog;

function inferShareFieldsErrorCode(issues: ZodIssue[]): HookErrorCode | null {
  let hasShareFieldIssue = false;

  for (const issue of issues) {
    if (issue.path[0] !== "share_fields") {
      continue;
    }
    hasShareFieldIssue = true;

    const lastPath = issue.path.at(-1);
    if (lastPath === "reason") {
      if (issue.code === "too_big") {
        return "REASON_TOO_LONG";
      }
      if (issue.code === "invalid_type" || issue.code === "too_small") {
        return "REASON_REQUIRED";
      }
    }
  }

  return hasShareFieldIssue ? "INVALID_SHARE_FIELDS" : null;
}

type CreateSessionValidationHook = Hook<
  unknown,
  SessionsAppEnv,
  "/",
  | RouteConfigToTypedResponse<typeof createSession>
  | Promise<RouteConfigToTypedResponse<typeof createSession>>
  | undefined
>;

export const createSessionValidationHook: CreateSessionValidationHook = (
  result,
  c
) => {
  if (result.success || result.target !== "json") {
    return;
  }

  const errorCode = inferShareFieldsErrorCode(result.error.issues);
  if (!errorCode) {
    return;
  }

  return c.json(
    {
      data: null,
      error: {
        code: errorCode,
        message: errorCatalog[errorCode].message,
        hint: errorCatalog[errorCode].hint,
        docs,
      },
    },
    400
  );
};
