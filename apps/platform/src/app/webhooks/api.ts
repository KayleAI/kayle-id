import { parseErrorResponse } from "@/utils/parse-error-response";

export type ApiError = {
  code: string;
  message: string;
  hint?: string;
  docs?: string;
};

export type Environment = "live" | "test";

export type DeliveryStatus = "pending" | "delivering" | "succeeded" | "failed";

export type Pagination = {
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
};

type ApiEnvelope<T> = {
  data: T | null;
  error: ApiError | null;
};

type PaginatedApiEnvelope<T> = {
  data: T[];
  error: ApiError | null;
  pagination: Pagination;
};

export type WebhookEndpoint = {
  id: string;
  organization_id: string;
  environment: Environment;
  name: string | null;
  url: string;
  enabled: boolean;
  subscribed_event_types: string[];
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
};

export type WebhookEndpointCreateResult = {
  endpoint: WebhookEndpoint;
  signing_secret: string;
};

export type WebhookDeleteResult = {
  message: string;
  status: "success";
};

export type WebhookSigningSecretResult = {
  endpoint_id: string;
  signing_secret: string;
};

export type WebhookEncryptionKey = {
  id: string;
  webhook_endpoint_id: string;
  key_id: string;
  algorithm: string;
  key_type: string;
  jwk: JsonWebKey;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
};

export type WebhookEventDelivery = {
  id: string;
  webhook_endpoint_id: string;
  status: DeliveryStatus;
  last_status_code: number | null;
  attempt_count: number;
  last_attempt_at: string | null;
};

export type WebhookEvent = {
  id: string;
  type: string;
  trigger_type: "verification_session" | "verification_attempt";
  trigger_id: string;
  environment: Environment;
  created_at: string;
  deliveries: WebhookEventDelivery[];
};

export type WebhookDelivery = {
  id: string;
  event_id: string;
  webhook_endpoint_id: string;
  webhook_encryption_key_id: string | null;
  status: DeliveryStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_status_code: number | null;
  last_attempt_at: string | null;
  created_at: string;
  updated_at: string;
};

type QueryValue = boolean | number | string | null | undefined;

type RequestOptions = {
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  path: string;
  body?: unknown;
  query?: Record<string, QueryValue>;
};

function buildQueryString(query?: Record<string, QueryValue>): string {
  if (!query) {
    return "";
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      value === "all"
    ) {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

async function requestWebhook<T>({
  body,
  method = "GET",
  path,
  query,
}: RequestOptions): Promise<T> {
  const response = await fetch(
    `/api/webhooks${path}${buildQueryString(query)}`,
    {
      method,
      credentials: "include",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(
        response,
        `Request failed with ${response.status}.`
      )
    );
  }

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (payload.error || payload.data === null) {
    throw new Error(payload.error?.message ?? "Unexpected webhook response.");
  }

  return payload.data;
}

async function requestWebhookPage<T>({
  body,
  method = "GET",
  path,
  query,
}: RequestOptions): Promise<{ data: T[]; pagination: Pagination }> {
  const response = await fetch(
    `/api/webhooks${path}${buildQueryString(query)}`,
    {
      method,
      credentials: "include",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseErrorResponse(
        response,
        `Request failed with ${response.status}.`
      )
    );
  }

  const payload = (await response.json()) as PaginatedApiEnvelope<T>;

  if (payload.error) {
    throw new Error(payload.error.message);
  }

  return {
    data: payload.data,
    pagination: payload.pagination,
  };
}

export function parseJwkInput(input: string): JsonWebKey {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Public JWK is required.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Public JWK must be valid JSON.");
  }

  if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
    throw new Error("Public JWK must be a JSON object.");
  }

  if (!("kty" in parsed)) {
    throw new Error("Public JWK must include a `kty` field.");
  }

  return parsed as JsonWebKey;
}

export function listWebhookEndpoints({
  enabled,
  environment,
  limit = 20,
  startingAfter,
}: {
  enabled?: boolean;
  environment?: Environment;
  limit?: number;
  startingAfter?: string | null;
} = {}): Promise<{ data: WebhookEndpoint[]; pagination: Pagination }> {
  return requestWebhookPage<WebhookEndpoint>({
    path: "/endpoints",
    query: {
      enabled,
      environment,
      limit,
      starting_after: startingAfter,
    },
  });
}

export function createWebhookEndpoint({
  enabled,
  environment,
  name,
  subscribedEventTypes,
  url,
}: {
  enabled: boolean;
  environment: Environment;
  name?: string | null;
  subscribedEventTypes: string[];
  url: string;
}): Promise<WebhookEndpointCreateResult> {
  return requestWebhook<WebhookEndpointCreateResult>({
    method: "POST",
    path: "/endpoints",
    body: {
      name,
      url,
      environment,
      enabled,
      subscribed_event_types: subscribedEventTypes,
    },
  });
}

export function updateWebhookEndpoint({
  endpointId,
  enabled,
  name,
  subscribedEventTypes,
  url,
}: {
  endpointId: string;
  enabled: boolean;
  name?: string | null;
  subscribedEventTypes: string[];
  url: string;
}): Promise<WebhookEndpoint> {
  return requestWebhook<WebhookEndpoint>({
    method: "PATCH",
    path: `/endpoints/${endpointId}`,
    body: {
      name,
      url,
      enabled,
      subscribed_event_types: subscribedEventTypes,
    },
  });
}

export function deleteWebhookEndpoint(
  endpointId: string
): Promise<WebhookDeleteResult> {
  return requestWebhook<WebhookDeleteResult>({
    method: "DELETE",
    path: `/endpoints/${endpointId}`,
  });
}

export function revealWebhookSigningSecret(
  endpointId: string
): Promise<WebhookSigningSecretResult> {
  return requestWebhook<WebhookSigningSecretResult>({
    method: "POST",
    path: `/endpoints/${endpointId}/signing-secret/reveal`,
  });
}

export function rotateWebhookSigningSecret(
  endpointId: string
): Promise<WebhookSigningSecretResult> {
  return requestWebhook<WebhookSigningSecretResult>({
    method: "POST",
    path: `/endpoints/${endpointId}/signing-secret/rotate`,
  });
}

export function listWebhookKeys({
  endpointId,
  isActive,
  limit = 20,
  startingAfter,
}: {
  endpointId: string;
  isActive?: boolean;
  limit?: number;
  startingAfter?: string | null;
}): Promise<{ data: WebhookEncryptionKey[]; pagination: Pagination }> {
  return requestWebhookPage<WebhookEncryptionKey>({
    path: `/endpoints/${endpointId}/keys`,
    query: {
      is_active: isActive,
      limit,
      starting_after: startingAfter,
    },
  });
}

export function createWebhookKey({
  endpointId,
  jwk,
  keyId,
}: {
  endpointId: string;
  jwk: JsonWebKey;
  keyId: string;
}): Promise<WebhookEncryptionKey> {
  return requestWebhook<WebhookEncryptionKey>({
    method: "POST",
    path: `/endpoints/${endpointId}/keys`,
    body: {
      key_id: keyId,
      jwk,
      algorithm: "RSA-OAEP-256",
      key_type: "RSA",
    },
  });
}

export function deactivateWebhookKey(
  keyId: string
): Promise<WebhookEncryptionKey> {
  return requestWebhook<WebhookEncryptionKey>({
    method: "POST",
    path: `/keys/${keyId}/deactivate`,
  });
}

export function reactivateWebhookKey(
  keyId: string
): Promise<WebhookEncryptionKey> {
  return requestWebhook<WebhookEncryptionKey>({
    method: "POST",
    path: `/keys/${keyId}/reactivate`,
  });
}

export function listWebhookEvents({
  environment,
  limit = 20,
  startingAfter,
}: {
  environment?: Environment;
  limit?: number;
  startingAfter?: string | null;
} = {}): Promise<{ data: WebhookEvent[]; pagination: Pagination }> {
  return requestWebhookPage<WebhookEvent>({
    path: "/events",
    query: {
      environment,
      limit,
      starting_after: startingAfter,
    },
  });
}

export function replayWebhookEvent(eventId: string): Promise<WebhookEvent> {
  return requestWebhook<WebhookEvent>({
    method: "POST",
    path: `/events/${eventId}/replay`,
  });
}

export function listWebhookDeliveries({
  endpointId,
  environment,
  limit = 20,
  startingAfter,
  status,
}: {
  endpointId?: string;
  environment?: Environment;
  limit?: number;
  startingAfter?: string | null;
  status?: DeliveryStatus;
} = {}): Promise<{ data: WebhookDelivery[]; pagination: Pagination }> {
  return requestWebhookPage<WebhookDelivery>({
    path: "/deliveries",
    query: {
      environment,
      endpoint_id: endpointId,
      limit,
      starting_after: startingAfter,
      status,
    },
  });
}

export function retryWebhookDelivery(
  deliveryId: string
): Promise<WebhookDelivery> {
  return requestWebhook<WebhookDelivery>({
    method: "POST",
    path: `/deliveries/${deliveryId}/retry`,
  });
}
