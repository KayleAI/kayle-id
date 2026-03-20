import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/config/env";
import {
  createDemoSession,
  createDemoWebhookEncryptionKey,
  createDemoWebhookEndpoint,
  DemoApiError,
  disableDemoWebhookEndpoint,
  getDemoOrgSlug,
  getPublicDemoSessionStatus,
} from "@/demo/api";
import type {
  DemoRequestedShareFields,
  DemoRunRecord,
  DemoRunView,
} from "@/demo/types";

const TRAILING_SLASH_PATTERN = /\/+$/u;

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

function createRandomToken(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const random = new Uint8Array(length);
  crypto.getRandomValues(random);

  let output = "";
  for (const value of random) {
    output += alphabet[value % alphabet.length];
  }

  return output;
}

function createDemoRunId(): string {
  return `demo_${crypto.randomUUID().replaceAll("-", "")}`;
}

function getDemoRunStub(runId: string) {
  if (!env.DEMO_RUNS) {
    throw new DemoApiError({
      message: "DEMO_RUNS binding is not configured.",
      status: 500,
    });
  }

  return env.DEMO_RUNS.getByName(runId);
}

async function loadRunRecord(runId: string): Promise<DemoRunRecord | null> {
  const response = await getDemoRunStub(runId).fetch(
    "https://demo.internal/state"
  );
  if (response.status === 404) {
    return null;
  }

  const payload = (await response.json()) as {
    data: DemoRunRecord | null;
    error: { message: string } | null;
  };

  if (!response.ok) {
    throw new DemoApiError({
      message: payload.error?.message ?? "Failed to load demo run.",
      status: response.status,
    });
  }

  return payload.data;
}

async function persistRunSession({
  runId,
  sessionId,
  shareFields,
  verificationUrl,
}: {
  runId: string;
  sessionId: string;
  shareFields: NonNullable<DemoRunRecord["share_fields"]>;
  verificationUrl: string;
}): Promise<void> {
  await getDemoRunStub(runId).fetch("https://demo.internal/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      share_fields: shareFields,
      verification_url: verificationUrl,
    }),
  });
}

async function persistRunStatus({
  runId,
  sessionStatus,
}: {
  runId: string;
  sessionStatus: NonNullable<DemoRunView["session_status"]>;
}): Promise<void> {
  await getDemoRunStub(runId).fetch("https://demo.internal/session-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sessionStatus),
  });
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof DemoApiError) {
    return createJsonResponse(
      {
        data: null,
        error: {
          code: error.code,
          hint: error.hint,
          message: error.message,
        },
      },
      { status: error.status }
    );
  }

  return createJsonResponse(
    {
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message:
          error instanceof Error ? error.message : "Unexpected demo error.",
      },
    },
    { status: 500 }
  );
}

async function handleCreateRun(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    public_jwk?: JsonWebKey;
  } | null;

  if (!(body?.public_jwk && typeof body.public_jwk === "object")) {
    return createJsonResponse(
      {
        data: null,
        error: {
          code: "BAD_REQUEST",
          message: "A public_jwk object is required.",
        },
      },
      { status: 400 }
    );
  }

  const runId = createDemoRunId();
  const receiverToken = createRandomToken(32);
  const keyId = `demo_${runId}`;
  const orgSlug = getDemoOrgSlug(env);

  let endpointId: string | null = null;

  try {
    const endpoint = await createDemoWebhookEndpoint({
      bindings: env,
      request,
      runId,
      token: receiverToken,
    });
    endpointId = endpoint.endpointId;

    await createDemoWebhookEncryptionKey({
      bindings: env,
      endpointId,
      keyId,
      publicJwk: body.public_jwk,
    });

    await getDemoRunStub(runId).fetch("https://demo.internal/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint_id: endpointId,
        key_id: keyId,
        org_slug: orgSlug,
        receiver_token: receiverToken,
      }),
    });

    return createJsonResponse({
      data: {
        demo_run_id: runId,
        endpoint_id: endpointId,
        org_slug: orgSlug,
        signing_secret: endpoint.signingSecret,
      },
      error: null,
    });
  } catch (error) {
    if (endpointId) {
      try {
        await disableDemoWebhookEndpoint({
          bindings: env,
          endpointId,
        });
      } catch {
        // Best-effort cleanup only.
      }
    }

    return toErrorResponse(error);
  }
}

async function handleCreateSession({
  request,
  runId,
}: {
  request: Request;
  runId: string;
}): Promise<Response> {
  const run = await loadRunRecord(runId);
  if (!run) {
    return createJsonResponse(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Demo run not found.",
        },
      },
      { status: 404 }
    );
  }

  if (run.session_id) {
    return createJsonResponse(
      {
        data: null,
        error: {
          code: "CONFLICT",
          message: "A verification session already exists for this demo run.",
        },
      },
      { status: 409 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    share_fields?: DemoRequestedShareFields;
  };

  const session = await createDemoSession({
    bindings: env,
    shareFields: body.share_fields,
  });

  await persistRunSession({
    runId,
    sessionId: session.id,
    shareFields: session.share_fields,
    verificationUrl: session.verification_url,
  });

  return createJsonResponse({
    data: {
      session_id: session.id,
      share_fields: session.share_fields,
      verification_url: session.verification_url,
    },
    error: null,
  });
}

async function handleGetRun(runId: string): Promise<Response> {
  const run = await loadRunRecord(runId);
  if (!run) {
    return createJsonResponse(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Demo run not found.",
        },
      },
      { status: 404 }
    );
  }

  const sessionStatus = run.session_id
    ? await getPublicDemoSessionStatus({
        bindings: env,
        sessionId: run.session_id,
      })
    : null;

  if (sessionStatus) {
    await persistRunStatus({
      runId,
      sessionStatus,
    });
  }

  return createJsonResponse({
    data: {
      id: runId,
      endpoint_id: run.endpoint_id,
      key_id: run.key_id,
      org_slug: run.org_slug,
      session_id: run.session_id,
      session_status: sessionStatus ?? run.last_session_status,
      share_fields: run.share_fields,
      verification_url: run.verification_url,
      webhook: run.webhook,
    } satisfies DemoRunView,
    error: null,
  });
}

async function handleReceiveWebhook({
  request,
  runId,
  token,
}: {
  request: Request;
  runId: string;
  token: string;
}): Promise<Response> {
  const response = await getDemoRunStub(runId).fetch(
    `https://demo.internal/webhook?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        "X-Kayle-Delivery-Id": request.headers.get("X-Kayle-Delivery-Id") ?? "",
        "X-Kayle-Event": request.headers.get("X-Kayle-Event") ?? "",
        "X-Kayle-Signature": request.headers.get("X-Kayle-Signature") ?? "",
      },
      body: await request.text(),
    }
  );

  if (response.status === 204) {
    return new Response(null, { status: 204 });
  }

  const payload = await response.json().catch(() => ({
    data: null,
    error: {
      message: "Webhook storage failed.",
    },
  }));

  return createJsonResponse(payload, { status: response.status });
}

export const Route = createFileRoute("/_api/api/demo/$")({
  server: {
    handlers: {
      ANY: ({ request }) => {
        try {
          const pathname = new URL(request.url).pathname.replace(
            TRAILING_SLASH_PATTERN,
            ""
          );
          const segments = pathname.split("/").filter(Boolean);

          if (
            request.method === "POST" &&
            segments.length === 3 &&
            segments[0] === "api" &&
            segments[1] === "demo" &&
            segments[2] === "runs"
          ) {
            return handleCreateRun(request);
          }

          if (
            request.method === "GET" &&
            segments.length === 4 &&
            segments[0] === "api" &&
            segments[1] === "demo" &&
            segments[2] === "runs"
          ) {
            return handleGetRun(segments[3]);
          }

          if (
            request.method === "POST" &&
            segments.length === 5 &&
            segments[0] === "api" &&
            segments[1] === "demo" &&
            segments[2] === "runs" &&
            segments[4] === "session"
          ) {
            return handleCreateSession({
              request,
              runId: segments[3],
            });
          }

          if (
            request.method === "POST" &&
            segments.length === 5 &&
            segments[0] === "api" &&
            segments[1] === "demo" &&
            segments[2] === "webhooks"
          ) {
            return handleReceiveWebhook({
              request,
              runId: segments[3],
              token: segments[4],
            });
          }

          return createJsonResponse(
            {
              data: null,
              error: {
                code: "NOT_FOUND",
                message: "Demo route not found.",
              },
            },
            { status: 404 }
          );
        } catch (error) {
          return toErrorResponse(error);
        }
      },
    },
  },
});
