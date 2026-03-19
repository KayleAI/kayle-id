import type {
  DemoRequestedShareFields,
  DemoSessionShareFields,
  DemoSessionStatus,
} from "./types";

type DemoBindings = {
  API?: Fetcher;
  KAYLE_DEMO_API_KEY?: string;
  KAYLE_DEMO_ORG_SLUG?: string;
};

type ApiErrorPayload = {
  code?: string;
  hint?: string;
  message?: string;
};

type ApiEnvelope<T> = {
  data: T | null;
  error: ApiErrorPayload | null;
};

const LOCAL_DEMO_WEBHOOK_ORIGIN = "http://127.0.0.1:3001";

export class DemoApiError extends Error {
  readonly code: string | null;
  readonly hint: string | null;
  readonly status: number;

  constructor({
    code,
    hint,
    message,
    status,
  }: {
    code?: string | null;
    hint?: string | null;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = "DemoApiError";
    this.code = code ?? null;
    this.hint = hint ?? null;
    this.status = status;
  }
}

function requireApiBinding(bindings: DemoBindings): Fetcher {
  if (!bindings.API) {
    throw new DemoApiError({
      message: "Platform API binding is not configured.",
      status: 500,
    });
  }

  return bindings.API;
}

export function getDemoApiKey(bindings: DemoBindings): string {
  const apiKey = bindings.KAYLE_DEMO_API_KEY?.trim();
  if (!apiKey) {
    throw new DemoApiError({
      message: "KAYLE_DEMO_API_KEY is not configured.",
      status: 500,
    });
  }

  return apiKey;
}

export function getDemoOrgSlug(bindings: DemoBindings): string {
  return bindings.KAYLE_DEMO_ORG_SLUG?.trim() || "kayle";
}

function inferApiKeyEnvironment(apiKey: string): "live" | "test" {
  return apiKey.startsWith("kk_test_") ? "test" : "live";
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return {
      data: null,
      error: {
        message: response.statusText || "Unexpected upstream response.",
      },
    };
  }
}

async function requestApi<T>({
  bindings,
  body,
  headers,
  method,
  path,
  useAuth,
}: {
  bindings: DemoBindings;
  body?: unknown;
  headers?: HeadersInit;
  method: string;
  path: string;
  useAuth: boolean;
}): Promise<T> {
  const api = requireApiBinding(bindings);
  const requestHeaders = new Headers(headers);

  if (useAuth) {
    requestHeaders.set("Authorization", `Bearer ${getDemoApiKey(bindings)}`);
  }

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await api.fetch(`http://api${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const envelope = await parseEnvelope<T>(response);
  if (!(response.ok && envelope.data)) {
    throw new DemoApiError({
      code: envelope.error?.code,
      hint: envelope.error?.hint,
      message:
        envelope.error?.message ??
        `Upstream request failed with ${response.status}.`,
      status: response.status,
    });
  }

  return envelope.data;
}

export function buildDemoWebhookUrl({
  request,
  runId,
  token,
}: {
  request: Request;
  runId: string;
  token: string;
}): string {
  const url =
    process.env.NODE_ENV === "production"
      ? new URL(request.url)
      : new URL(LOCAL_DEMO_WEBHOOK_ORIGIN);
  url.pathname = `/api/demo/webhooks/${runId}/${token}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function createDemoWebhookEndpoint({
  bindings,
  request,
  runId,
  token,
}: {
  bindings: DemoBindings;
  request: Request;
  runId: string;
  token: string;
}): Promise<{ endpointId: string; signingSecret: string }> {
  const environment = inferApiKeyEnvironment(getDemoApiKey(bindings));
  const data = await requestApi<{
    endpoint: {
      id: string;
    };
    signing_secret: string;
  }>({
    bindings,
    method: "POST",
    path: "/v1/webhooks/endpoints",
    useAuth: true,
    body: {
      url: buildDemoWebhookUrl({ request, runId, token }),
      environment,
      enabled: true,
      subscribed_event_types: ["verification.attempt.succeeded"],
    },
  });

  return {
    endpointId: data.endpoint.id,
    signingSecret: data.signing_secret,
  };
}

export async function createDemoWebhookEncryptionKey({
  bindings,
  endpointId,
  keyId,
  publicJwk,
}: {
  bindings: DemoBindings;
  endpointId: string;
  keyId: string;
  publicJwk: JsonWebKey;
}): Promise<void> {
  await requestApi({
    bindings,
    method: "POST",
    path: `/v1/webhooks/endpoints/${endpointId}/keys`,
    useAuth: true,
    body: {
      key_id: keyId,
      jwk: publicJwk,
      algorithm: "RSA-OAEP-256",
      key_type: "RSA",
    },
  });
}

export async function disableDemoWebhookEndpoint({
  bindings,
  endpointId,
}: {
  bindings: DemoBindings;
  endpointId: string;
}): Promise<void> {
  await requestApi({
    bindings,
    method: "PATCH",
    path: `/v1/webhooks/endpoints/${endpointId}`,
    useAuth: true,
    body: {
      enabled: false,
    },
  });
}

export function createDemoSession({
  bindings,
  shareFields,
}: {
  bindings: DemoBindings;
  shareFields: DemoRequestedShareFields | undefined;
}): Promise<{
  id: string;
  share_fields: DemoSessionShareFields;
  verification_url: string;
}> {
  return requestApi<{
    id: string;
    share_fields: DemoSessionShareFields;
    verification_url: string;
  }>({
    bindings,
    method: "POST",
    path: "/v1/sessions",
    useAuth: true,
    body: shareFields ? { share_fields: shareFields } : {},
  });
}

export async function getPublicDemoSessionStatus({
  bindings,
  sessionId,
}: {
  bindings: DemoBindings;
  sessionId: string;
}): Promise<DemoSessionStatus | null> {
  const api = requireApiBinding(bindings);
  const response = await api.fetch(
    `http://api/v1/verify/session/${sessionId}/status`
  );

  if (response.status === 404) {
    return null;
  }

  const envelope = await parseEnvelope<DemoSessionStatus>(response);
  if (!(response.ok && envelope.data)) {
    throw new DemoApiError({
      code: envelope.error?.code,
      hint: envelope.error?.hint,
      message:
        envelope.error?.message ??
        `Session status request failed with ${response.status}.`,
      status: response.status,
    });
  }

  return envelope.data;
}
