import {
  createFaceMatcherResponse,
  FACE_MATCHER_AUTH_HEADER,
  type FaceMatcherMultipartPayload,
  faceMatcherResponseSchema,
  parseFaceMatcherRequestFormData,
} from "@kayle-id/config/face-matcher";
import { configureVerifyAssetFetcherFromEnv } from "../../../apps/api/src/v1/verify/verify-assets";
import { matchFacesWithContainer } from "./matcher";

export const FACE_MATCHER_MODEL_PATH = "/app/models/w600k_mbf.onnx";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
export type ContainerFetcher = {
  fetch: FetchLike;
};

type GetContainer = (env: unknown) => Promise<ContainerFetcher | null>;

function logFaceMatcherEvent({
  event,
  level = "info",
  details,
}: {
  details?: Record<string, unknown>;
  event: string;
  level?: "info" | "warn";
}): void {
  const message = JSON.stringify({
    event: `face_matcher.${event}`,
    ...(details ?? {}),
  });

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.info(message);
}

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

  return request.headers.get(FACE_MATCHER_AUTH_HEADER) === matcherSecret;
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
  requestId: string
): Promise<Response> {
  if (!container) {
    logFaceMatcherEvent({
      event: "health_unavailable",
      level: "warn",
      details: {
        request_id: requestId,
        reason: "container_binding_missing",
      },
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
    logFaceMatcherEvent({
      event: "health_unavailable",
      level: "warn",
      details: {
        request_id: requestId,
        reason: error instanceof Error ? error.message : String(error),
      },
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
  requestId,
}: {
  request: Request;
  requestId: string;
}): Promise<FaceMatcherMultipartPayload | Response> {
  try {
    return await parseFaceMatcherRequestFormData(await request.formData());
  } catch (error) {
    logFaceMatcherEvent({
      event: "invalid_request",
      level: "warn",
      details: {
        request_id: requestId,
        reason: error instanceof Error ? error.message : String(error),
      },
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
  requestId,
}: {
  env: FaceMatcherBindings;
  getContainer: GetContainer;
  request: Request;
  requestId: string;
}): Promise<Response> {
  const matcherSecret =
    resolveStringEnvValue(env, "FACE_MATCHER_SECRET") ?? undefined;

  if (!isInternalRequestAuthorized(request, matcherSecret)) {
    logFaceMatcherEvent({
      event: "unauthorized",
      level: "warn",
      details: {
        request_id: requestId,
      },
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
    requestId,
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

  logFaceMatcherEvent({
    event: "completed",
    details: {
      request_id: requestId,
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
      const requestId = crypto.randomUUID();
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return proxyHealth(await getContainer(env), requestId);
      }

      if (request.method === "POST" && url.pathname === "/match") {
        return handleMatchRequest({
          env,
          getContainer,
          request,
          requestId,
        });
      }

      return jsonResponse(
        {
          error: {
            code: "NOT_FOUND",
            message: "Face matcher route was not found.",
          },
        },
        404
      );
    },
  };
}
