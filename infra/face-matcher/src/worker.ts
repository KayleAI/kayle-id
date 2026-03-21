import {
  createFaceMatcherResponse,
  FACE_MATCHER_AUTH_HEADER,
  type FaceMatcherMultipartPayload,
  faceMatcherResponseSchema,
  parseFaceMatcherRequestFormData,
} from "@kayle-id/config/face-matcher";
import {
  createSafeRequestLogger,
  emitSafeRequestLog,
  initStructuredLogger,
  logEvent,
  logSafeError,
  type SafeRequestLogger,
} from "@kayle-id/config/logging";
import { configureVerifyAssetFetcherFromEnv } from "../../../apps/api/src/v1/verify/verify-assets";
import pkg from "../package.json" with { type: "json" };
import { matchFacesWithContainer } from "./matcher";

export const FACE_MATCHER_MODEL_PATH = "/app/models/w600k_mbf.onnx";
export const FACE_MATCHER_DETECTOR_PATH =
  "/app/models/face_detection_yunet_2023mar.onnx";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
export type ContainerFetcher = {
  fetch: FetchLike;
};

type GetContainer = (env: unknown) => Promise<ContainerFetcher | null>;
type FaceMatcherRequestLogger = SafeRequestLogger;

initStructuredLogger({
  environment: process.env.NODE_ENV,
  service: pkg.name,
  version: pkg.version,
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}

function isInternalRequestAuthorized(
  request: Request,
  matcherSecret?: string
): boolean {
  if (!(typeof matcherSecret === "string" && matcherSecret.length > 0)) {
    return true;
  }

  return (
    request.headers.get(FACE_MATCHER_AUTH_HEADER) === matcherSecret ||
    request.headers.get("authorization") === `Bearer ${matcherSecret}`
  );
}

function resolveStringEnvValue(env: unknown, key: string): string | null {
  if (!(env && typeof env === "object")) {
    return null;
  }

  const candidate = Reflect.get(env, key);
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

async function proxyHealth(
  container: ContainerFetcher | null,
  logger: FaceMatcherRequestLogger
): Promise<Response> {
  if (!container) {
    logEvent(logger, {
      details: {
        error_code: "face_matcher_container_binding_missing",
      },
      event: "face_matcher.health_unavailable",
      level: "warn",
    });

    return jsonResponse(
      {
        data: {
          modelPath: FACE_MATCHER_MODEL_PATH,
          ready: false,
          status: "unhealthy",
        },
        error: {
          code: "MATCHER_UNAVAILABLE",
          message: "Face matcher container binding is unavailable.",
        },
      },
      503
    );
  }

  try {
    return await container.fetch("http://container/health");
  } catch (error) {
    logSafeError(logger, {
      code: "face_matcher_health_unavailable",
      error,
      event: "face_matcher.health_unavailable",
      message: "Face matcher health check failed.",
      status: 503,
    });

    return jsonResponse(
      {
        data: {
          modelPath: FACE_MATCHER_MODEL_PATH,
          ready: false,
          status: "unhealthy",
        },
        error: {
          code: "MATCHER_UNAVAILABLE",
          message: "Face matcher health check failed.",
        },
      },
      503
    );
  }
}

async function parseMatchPayload({
  request,
  logger,
}: {
  request: Request;
  logger: FaceMatcherRequestLogger;
}): Promise<FaceMatcherMultipartPayload | Response> {
  try {
    return await parseFaceMatcherRequestFormData(await request.formData());
  } catch (error) {
    logSafeError(logger, {
      code: "face_matcher_invalid_request",
      error,
      event: "face_matcher.invalid_request",
      message: "Face matcher request payload is invalid.",
      status: 400,
    });

    return jsonResponse(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Face matcher request payload is invalid.",
        },
      },
      400
    );
  }
}

async function handleMatchRequest({
  env,
  getContainer,
  request,
  logger,
}: {
  env: FaceMatcherBindings;
  getContainer: GetContainer;
  request: Request;
  logger: FaceMatcherRequestLogger;
}): Promise<Response> {
  const matcherSecret =
    resolveStringEnvValue(env, "FACE_MATCHER_SECRET") ?? undefined;

  if (!isInternalRequestAuthorized(request, matcherSecret)) {
    logEvent(logger, {
      details: {
        error_code: "face_matcher_unauthorized",
        status: 401,
      },
      event: "face_matcher.unauthorized",
      level: "warn",
    });

    return jsonResponse(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Unauthorized matcher request.",
        },
      },
      401
    );
  }

  const payload = await parseMatchPayload({
    request,
    logger,
  });

  if (payload instanceof Response) {
    return payload;
  }

  configureVerifyAssetFetcherFromEnv(env);

  const container = await getContainer(env);
  const startedAt = Date.now();
  const result = await matchFacesWithContainer({
    container: container ?? {
      fetch: async () =>
        new Response(null, {
          status: 503,
        }),
    },
    dg2Image: payload.dg2Image,
    selfies: payload.selfies,
    threshold: payload.threshold,
  });
  const response = faceMatcherResponseSchema.parse(
    createFaceMatcherResponse(result)
  );

  logEvent(logger, {
    details: {
      duration_ms: Date.now() - startedAt,
      dg2_bytes: payload.dg2Image.length,
      selfie_count: payload.selfies.length,
      selfie_bytes: payload.selfies.reduce(
        (total: number, selfie: Uint8Array) => total + selfie.length,
        0
      ),
      face_score: response.faceScore,
      passed: response.passed,
      used_fallback: response.usedFallback,
      reason: response.reason ?? null,
    },
    event: "face_matcher.completed",
  });

  return jsonResponse(response);
}

export function createFaceMatcherWorker(
  { getContainer }: { getContainer: GetContainer } = {
    getContainer: async () => null,
  }
): Required<Pick<ExportedHandler<FaceMatcherBindings>, "fetch">> {
  return {
    fetch: async (request, env) => {
      const logger = createSafeRequestLogger(request);
      const url = new URL(request.url);
      try {
        if (request.method === "GET" && url.pathname === "/health") {
          const response = await proxyHealth(await getContainer(env), logger);
          emitSafeRequestLog(logger, response.status);
          return response;
        }

        if (request.method === "POST" && url.pathname === "/match") {
          const response = await handleMatchRequest({
            env,
            getContainer,
            logger,
            request,
          });
          emitSafeRequestLog(logger, response.status);
          return response;
        }

        logEvent(logger, {
          details: {
            error_code: "face_matcher_route_not_found",
            status: 404,
          },
          event: "face_matcher.not_found",
          level: "warn",
        });

        const response = jsonResponse(
          {
            error: {
              code: "NOT_FOUND",
              message: "Face matcher route was not found.",
            },
          },
          404
        );
        emitSafeRequestLog(logger, response.status);
        return response;
      } catch (error) {
        logSafeError(logger, {
          code: "face_matcher_request_failed",
          error,
          event: "face_matcher.request_failed",
          message: "Face matcher request failed.",
          status: 500,
        });
        emitSafeRequestLog(logger, 500);
        throw error;
      }
    },
  };
}
