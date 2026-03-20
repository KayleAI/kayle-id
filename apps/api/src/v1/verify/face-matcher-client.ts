import {
  createFaceMatcherRequestFormData,
  FACE_MATCHER_AUTH_HEADER,
  faceMatcherResponseSchema,
} from "@kayle-id/config/face-matcher";
import { buildSafeErrorContext } from "@kayle-id/config/logging";
import type { ApiRequestLogger } from "@/logging";
import type { FaceScoreResult } from "./validation-types";

type FaceMatcherServiceBinding = {
  fetch: typeof fetch;
};

function logFaceMatcherEvent({
  event,
  logger,
  level = "warn",
  details,
}: {
  event: string;
  logger?: ApiRequestLogger;
  level?: "info" | "warn";
  details: Record<string, unknown>;
}): void {
  if (!logger) {
    return;
  }

  const context = {
    event: `verify.face_matcher.${event}`,
    ...details,
  };

  if (level === "info") {
    logger.info(context.event, context);
    return;
  }

  logger.warn(context.event, context);
}

function createUnavailableFaceScore(reason: string): FaceScoreResult {
  return {
    faceScore: null,
    passed: false,
    usedFallback: true,
    reason,
  };
}

function resolveStringEnvValue(env: unknown, key: string): string | null {
  if (!env || typeof env !== "object") {
    return null;
  }

  const candidate = Reflect.get(env, key);
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

function resolveFaceMatcherServiceBinding(
  env: unknown
): FaceMatcherServiceBinding | null {
  if (!(env && typeof env === "object")) {
    return null;
  }

  const candidate = Reflect.get(env, "FACE_MATCHER");

  if (!(candidate && typeof candidate === "object")) {
    return null;
  }

  const fetchBinding = Reflect.get(candidate, "fetch");

  return typeof fetchBinding === "function"
    ? (candidate as FaceMatcherServiceBinding)
    : null;
}

function resolveFaceMatcherSecret(env: unknown): string | null {
  return resolveStringEnvValue(env, "FACE_MATCHER_SECRET");
}

async function requestFaceMatcher({
  dg2Image,
  selfies,
  threshold,
  matcherBinding,
  matcherSecret,
  attemptId,
  logger,
}: {
  dg2Image: Uint8Array;
  selfies: Uint8Array[];
  threshold?: number;
  matcherBinding: FaceMatcherServiceBinding;
  matcherSecret: string | null;
  attemptId?: string;
  logger?: ApiRequestLogger;
}): Promise<FaceScoreResult> {
  const startedAt = Date.now();
  const formData = createFaceMatcherRequestFormData({
    dg2Image,
    selfies,
    threshold,
  });

  try {
    const request = new Request("https://face-matcher.internal/match", {
      body: formData,
      headers: matcherSecret
        ? {
            authorization: `Bearer ${matcherSecret}`,
            [FACE_MATCHER_AUTH_HEADER]: matcherSecret,
          }
        : undefined,
      method: "POST",
    });
    const response = (await Reflect.apply(
      matcherBinding.fetch,
      matcherBinding,
      [request]
    )) as Response;

    if (!response.ok) {
      logFaceMatcherEvent({
        event: "http_error",
        logger,
        details: {
          attempt_id: attemptId ?? null,
          error_code: "face_matcher_http_error",
          status: response.status,
          duration_ms: Date.now() - startedAt,
        },
      });
      return createUnavailableFaceScore("face_matcher_unavailable");
    }

    const json = await response.json().catch((error) => {
      logFaceMatcherEvent({
        event: "invalid_json",
        logger,
        details: {
          attempt_id: attemptId ?? null,
          duration_ms: Date.now() - startedAt,
          ...buildSafeErrorContext({
            code: "face_matcher_invalid_json",
            error,
            message: "Face matcher returned invalid JSON.",
          }),
        },
      });
      return null;
    });

    if (json === null) {
      return createUnavailableFaceScore("face_matcher_unavailable");
    }

    const payload = faceMatcherResponseSchema.safeParse(json);

    if (!payload.success) {
      logFaceMatcherEvent({
        event: "invalid_response",
        logger,
        details: {
          attempt_id: attemptId ?? null,
          duration_ms: Date.now() - startedAt,
          error_code: "face_matcher_invalid_response",
          issue_count: payload.error.issues.length,
        },
      });
      return createUnavailableFaceScore("face_matcher_unavailable");
    }

    logFaceMatcherEvent({
      event: "request_succeeded",
      logger,
      level: "info",
      details: {
        attempt_id: attemptId ?? null,
        duration_ms: Date.now() - startedAt,
        face_score: payload.data.faceScore,
        passed: payload.data.passed,
        used_fallback: payload.data.usedFallback,
        reason: payload.data.reason ?? null,
      },
    });

    return {
      faceScore: payload.data.faceScore,
      passed: payload.data.passed,
      usedFallback: payload.data.usedFallback,
      reason: payload.data.reason,
    };
  } catch (error) {
    logFaceMatcherEvent({
      event: "request_failed",
      logger,
      details: {
        attempt_id: attemptId ?? null,
        duration_ms: Date.now() - startedAt,
        ...buildSafeErrorContext({
          code: "face_matcher_request_failed",
          error,
          message: "Face matcher request failed.",
        }),
      },
    });
    return createUnavailableFaceScore("face_matcher_unavailable");
  }
}

export function matchFaces({
  dg2Image,
  selfies,
  threshold,
  env,
  attemptId,
  logger,
}: {
  dg2Image: Uint8Array;
  selfies: Uint8Array[];
  threshold?: number;
  env: unknown;
  attemptId?: string;
  logger?: ApiRequestLogger;
}): Promise<FaceScoreResult> {
  const matcherBinding = resolveFaceMatcherServiceBinding(env);
  const matcherSecret = resolveFaceMatcherSecret(env);

  if (!matcherBinding) {
    logFaceMatcherEvent({
      event: "config_missing",
      logger,
      details: {
        attempt_id: attemptId ?? null,
        error_code: "face_matcher_config_missing",
        dg2_bytes: dg2Image.length,
        selfie_count: selfies.length,
        selfie_bytes: selfies.reduce(
          (total, selfie) => total + selfie.length,
          0
        ),
      },
    });

    return Promise.resolve(
      createUnavailableFaceScore("face_matcher_unavailable")
    );
  }

  return requestFaceMatcher({
    matcherBinding,
    matcherSecret,
    dg2Image,
    selfies,
    threshold,
    attemptId,
    logger,
  });
}
