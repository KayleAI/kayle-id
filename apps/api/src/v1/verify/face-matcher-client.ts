import {
  createFaceMatcherRequestFormData,
  FACE_MATCHER_AUTH_HEADER,
  faceMatcherResponseSchema,
} from "@kayle-id/config/face-matcher";
import { logEvent, logSafeError } from "@kayle-id/config/logging";
import type { ApiRequestLogger } from "@/logging";
import type { FaceScoreResult } from "./validation-types";

type FaceMatcherServiceBinding = {
  fetch: typeof fetch;
};

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
      logEvent(logger, {
        details: {
          attempt_id: attemptId ?? null,
          error_code: "face_matcher_http_error",
          status: response.status,
          duration_ms: Date.now() - startedAt,
        },
        event: "verify.face_matcher.http_error",
        level: "warn",
      });
      return createUnavailableFaceScore("face_matcher_unavailable");
    }

    const json = await response.json().catch((error) => {
      logSafeError(logger, {
        code: "face_matcher_invalid_json",
        details: {
          attempt_id: attemptId ?? null,
          duration_ms: Date.now() - startedAt,
        },
        error,
        event: "verify.face_matcher.invalid_json",
        message: "Face matcher returned invalid JSON.",
      });
      return null;
    });

    if (json === null) {
      return createUnavailableFaceScore("face_matcher_unavailable");
    }

    const payload = faceMatcherResponseSchema.safeParse(json);

    if (!payload.success) {
      logEvent(logger, {
        details: {
          attempt_id: attemptId ?? null,
          duration_ms: Date.now() - startedAt,
          error_code: "face_matcher_invalid_response",
          issue_count: payload.error.issues.length,
        },
        event: "verify.face_matcher.invalid_response",
        level: "warn",
      });
      return createUnavailableFaceScore("face_matcher_unavailable");
    }

    logEvent(logger, {
      details: {
        attempt_id: attemptId ?? null,
        duration_ms: Date.now() - startedAt,
        face_score: payload.data.faceScore,
        passed: payload.data.passed,
        used_fallback: payload.data.usedFallback,
        reason: payload.data.reason ?? null,
      },
      event: "verify.face_matcher.request_succeeded",
    });

    return {
      faceScore: payload.data.faceScore,
      passed: payload.data.passed,
      usedFallback: payload.data.usedFallback,
      reason: payload.data.reason,
    };
  } catch (error) {
    logSafeError(logger, {
      code: "face_matcher_request_failed",
      details: {
        attempt_id: attemptId ?? null,
        duration_ms: Date.now() - startedAt,
      },
      error,
      event: "verify.face_matcher.request_failed",
      message: "Face matcher request failed.",
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
    logEvent(logger, {
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
      event: "verify.face_matcher.config_missing",
      level: "warn",
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
