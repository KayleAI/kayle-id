import {
  createFaceMatcherRequestFormData,
  FACE_MATCHER_AUTH_HEADER,
  faceMatcherResponseSchema,
} from "@kayle-id/config/face-matcher";
import type { FaceScoreResult } from "./validation-types";

type FaceMatcherServiceBinding = {
  fetch: typeof fetch;
};

function logFaceMatcherEvent({
  event,
  level = "warn",
  details,
}: {
  event: string;
  level?: "info" | "warn";
  details: Record<string, unknown>;
}): void {
  const message = JSON.stringify({
    event: `verify.face_matcher.${event}`,
    ...details,
  });

  if (level === "info") {
    console.info(message);
    return;
  }

  console.warn(message);
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
}: {
  dg2Image: Uint8Array;
  selfies: Uint8Array[];
  threshold?: number;
  matcherBinding: FaceMatcherServiceBinding;
  matcherSecret: string | null;
  attemptId?: string;
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
      const responseText = await response.text().catch(() => null);
      logFaceMatcherEvent({
        event: "http_error",
        details: {
          attempt_id: attemptId ?? null,
          status: response.status,
          response_text: responseText,
          duration_ms: Date.now() - startedAt,
        },
      });
      return createUnavailableFaceScore("face_matcher_unavailable");
    }

    const json = await response.json().catch((error) => {
      logFaceMatcherEvent({
        event: "invalid_json",
        details: {
          attempt_id: attemptId ?? null,
          duration_ms: Date.now() - startedAt,
          error_name: error instanceof Error ? error.name : "unknown_error",
          error_message: error instanceof Error ? error.message : String(error),
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
        details: {
          attempt_id: attemptId ?? null,
          duration_ms: Date.now() - startedAt,
          issues: payload.error.issues.map((issue) => issue.message),
        },
      });
      return createUnavailableFaceScore("face_matcher_unavailable");
    }

    logFaceMatcherEvent({
      event: "request_succeeded",
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
      details: {
        attempt_id: attemptId ?? null,
        duration_ms: Date.now() - startedAt,
        error_name: error instanceof Error ? error.name : "unknown_error",
        error_message: error instanceof Error ? error.message : String(error),
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
}: {
  dg2Image: Uint8Array;
  selfies: Uint8Array[];
  threshold?: number;
  env: unknown;
  attemptId?: string;
}): Promise<FaceScoreResult> {
  const matcherBinding = resolveFaceMatcherServiceBinding(env);
  const matcherSecret = resolveFaceMatcherSecret(env);

  if (!matcherBinding) {
    logFaceMatcherEvent({
      event: "config_missing",
      details: {
        attempt_id: attemptId ?? null,
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
  });
}
