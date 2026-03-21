import { expect, test } from "bun:test";
import {
  buildSafeErrorContext,
  createSafeRequestLogger,
  logEvent,
  logSafeError,
  type SafeRequestLogger,
} from "@kayle-id/config/logging";
import { matchFaces } from "@/v1/verify/face-matcher-client";

type LoggedCall = {
  context: Record<string, unknown>;
  message: string;
};

type MockLogger = SafeRequestLogger & {
  infoCalls: LoggedCall[];
  warnCalls: LoggedCall[];
};

function createMockLogger(): MockLogger {
  const context: Record<string, unknown> = {};
  const infoCalls: LoggedCall[] = [];
  const warnCalls: LoggedCall[] = [];

  return {
    emit: () => null,
    getContext: () => ({ ...context }),
    info: (message, nextContext) => {
      infoCalls.push({
        context: nextContext ?? {},
        message,
      });
      Object.assign(context, nextContext ?? {});
    },
    infoCalls,
    set: (nextContext) => {
      Object.assign(context, nextContext);
    },
    warn: (message, nextContext) => {
      warnCalls.push({
        context: nextContext ?? {},
        message,
      });
      Object.assign(context, nextContext ?? {});
    },
    warnCalls,
  };
}

test("createSafeRequestLogger strips query strings and does not include extra request metadata", () => {
  const request = new Request(
    "https://api.kayle.id/v1/verify/session/vs_test_123?token=secret-value"
  );

  Reflect.set(request as unknown as object, "cf", {
    asn: 13_335,
    colo: "LHR",
    country: "GB",
  });

  const logger = createSafeRequestLogger({
    headers: new Headers({
      "cf-ray": "ray-123",
      traceparent: "trace-123",
      "user-agent": "test-agent",
    }),
    method: request.method,
    path: request.url,
  });

  expect(logger.getContext()).toEqual(
    expect.objectContaining({
      method: "GET",
      path: "/v1/verify/session/vs_test_123",
      request_id: "ray-123",
    })
  );
  expect(logger.getContext()).not.toHaveProperty("asn");
  expect(logger.getContext()).not.toHaveProperty("colo");
  expect(logger.getContext()).not.toHaveProperty("country");
  expect(logger.getContext()).not.toHaveProperty("requestHeaders");
  expect(logger.getContext()).not.toHaveProperty("traceparent");
});

test("createSafeRequestLogger accepts a Request instance", () => {
  const request = new Request(
    "https://api.kayle.id/v1/verify/session/vs_test_456?token=secret-value",
    {
      headers: {
        "x-request-id": "req-456",
      },
      method: "POST",
    }
  );

  const logger = createSafeRequestLogger(request);

  expect(logger.getContext()).toEqual(
    expect.objectContaining({
      method: "POST",
      path: "/v1/verify/session/vs_test_456",
      request_id: "req-456",
    })
  );
});

test("buildSafeErrorContext uses explicit safe messages", () => {
  const unsafeError = new Error("token=secret-value");
  unsafeError.name = "SyntaxError";

  expect(
    buildSafeErrorContext({
      code: "face_matcher_invalid_json",
      error: unsafeError,
      message: "Face matcher returned invalid JSON.",
    })
  ).toEqual({
    error_code: "face_matcher_invalid_json",
    error_message: "Face matcher returned invalid JSON.",
    error_name: "SyntaxError",
  });
});

test("logEvent includes the event in info log context", () => {
  const logger = createMockLogger();

  logEvent(logger, {
    details: {
      duration_ms: 12,
    },
    event: "verify.face_matcher.request_succeeded",
  });

  expect(logger.infoCalls[0]).toEqual({
    context: {
      duration_ms: 12,
      event: "verify.face_matcher.request_succeeded",
    },
    message: "verify.face_matcher.request_succeeded",
  });
});

test("logSafeError emits safe warn events", () => {
  const logger = createMockLogger();
  const unsafeError = new Error("token=secret-value");
  unsafeError.name = "SyntaxError";

  logSafeError(logger, {
    code: "face_matcher_invalid_json",
    details: {
      duration_ms: 12,
    },
    error: unsafeError,
    event: "verify.face_matcher.invalid_json",
    message: "Face matcher returned invalid JSON.",
  });

  expect(logger.warnCalls[0]).toEqual({
    context: expect.objectContaining({
      duration_ms: 12,
      error_code: "face_matcher_invalid_json",
      error_message: "Face matcher returned invalid JSON.",
      error_name: "SyntaxError",
      event: "verify.face_matcher.invalid_json",
    }),
    message: "verify.face_matcher.invalid_json",
  });
  expect(logger.warnCalls[0]?.context).not.toHaveProperty("error_stack");
});

test("matchFaces does not log upstream response bodies on HTTP errors", async () => {
  const logger = createMockLogger();

  const result = await matchFaces({
    dg2Image: new Uint8Array([0x01, 0x02]),
    env: {
      FACE_MATCHER: {
        fetch: async () =>
          new Response("secret=should-not-be-logged", {
            status: 503,
          }),
      },
      FACE_MATCHER_SECRET: "test-secret",
    },
    logger,
    selfies: [new Uint8Array([0x03, 0x04])],
  });

  expect(result).toEqual({
    faceScore: null,
    passed: false,
    reason: "face_matcher_unavailable",
    usedFallback: true,
  });
  expect(logger.warnCalls[0]).toEqual({
    context: expect.objectContaining({
      duration_ms: expect.any(Number),
      error_code: "face_matcher_http_error",
      event: "verify.face_matcher.http_error",
      status: 503,
    }),
    message: "verify.face_matcher.http_error",
  });
  expect(logger.warnCalls[0]?.context).not.toHaveProperty("response_text");
});

test("matchFaces logs safe invalid JSON errors without raw parser messages", async () => {
  const logger = createMockLogger();

  const result = await matchFaces({
    dg2Image: new Uint8Array([0x01, 0x02]),
    env: {
      FACE_MATCHER: {
        fetch: async () =>
          new Response("not-json", {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          }),
      },
      FACE_MATCHER_SECRET: "test-secret",
    },
    logger,
    selfies: [new Uint8Array([0x03, 0x04])],
  });

  expect(result).toEqual({
    faceScore: null,
    passed: false,
    reason: "face_matcher_unavailable",
    usedFallback: true,
  });
  expect(logger.warnCalls[0]).toEqual({
    context: expect.objectContaining({
      duration_ms: expect.any(Number),
      error_code: "face_matcher_invalid_json",
      error_message: "Face matcher returned invalid JSON.",
      error_name: "SyntaxError",
      event: "verify.face_matcher.invalid_json",
    }),
    message: "verify.face_matcher.invalid_json",
  });
  expect(logger.warnCalls[0]?.context).not.toHaveProperty("error_stack");
});
