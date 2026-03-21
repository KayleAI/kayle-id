import { SUPPORTED_WEBHOOK_EVENT_TYPES } from "@kayle-id/config/webhook-events";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWebhookEndpoint,
  createWebhookKey,
  deactivateWebhookKey,
  deleteWebhookEndpoint,
  listWebhookEndpoints,
  parseJwkInput,
  reactivateWebhookKey,
  revealWebhookSigningSecret,
} from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("parseJwkInput", () => {
  test("parses a valid JWK object", () => {
    expect(
      parseJwkInput(
        JSON.stringify({
          kty: "RSA",
          n: "abc123",
          e: "AQAB",
        })
      )
    ).toEqual({
      kty: "RSA",
      n: "abc123",
      e: "AQAB",
    });
  });

  test("rejects invalid JSON", () => {
    expect(() => parseJwkInput("{invalid")).toThrow(
      "Public JWK must be valid JSON."
    );
  });

  test("rejects missing kty", () => {
    expect(() => parseJwkInput(JSON.stringify({ n: "abc123" }))).toThrow(
      "Public JWK must include a `kty` field."
    );
  });
});

describe("webhook api helpers", () => {
  test("lists endpoints with serialized query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: [],
        error: null,
        pagination: {
          has_more: false,
          limit: 10,
          next_cursor: null,
        },
      })
    );

    globalThis.fetch = fetchMock as typeof fetch;

    await listWebhookEndpoints({
      limit: 10,
      startingAfter: "whe_123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/endpoints?limit=10&starting_after=whe_123",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      })
    );
  });

  test("reveals a signing secret with the expected endpoint path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          endpoint_id: "whe_123",
          signing_secret: "whsec_123",
        },
        error: null,
      })
    );

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(revealWebhookSigningSecret("whe_123")).resolves.toEqual({
      endpoint_id: "whe_123",
      signing_secret: "whsec_123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/endpoints/whe_123/signing-secret/reveal",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      })
    );
  });

  test("creates keys as RSA OAEP webhook encryption keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          id: "whk_123",
          webhook_endpoint_id: "whe_123",
          key_id: "demo-key",
          algorithm: "RSA-OAEP-256",
          key_type: "RSA",
          jwk: { e: "AQAB", kty: "RSA", n: "abc123" },
          is_active: true,
          created_at: "2026-03-19T00:00:00.000Z",
          updated_at: "2026-03-19T00:00:00.000Z",
          disabled_at: null,
        },
        error: null,
      })
    );

    globalThis.fetch = fetchMock as typeof fetch;

    await createWebhookKey({
      endpointId: "whe_123",
      keyId: "demo-key",
      jwk: {
        e: "AQAB",
        kty: "RSA",
        n: "abc123",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/endpoints/whe_123/keys",
      expect.objectContaining({
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    );

    const [, requestOptions] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(requestOptions?.body))).toEqual({
      algorithm: "RSA-OAEP-256",
      jwk: {
        e: "AQAB",
        kty: "RSA",
        n: "abc123",
      },
      key_id: "demo-key",
      key_type: "RSA",
    });
  });

  test("creates endpoints with the configured name and subscriptions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          endpoint: {
            id: "whe_123",
            organization_id: "org_123",
            name: "Primary production webhook",
            url: "https://example.com/webhooks/kayle",
            enabled: true,
            subscribed_event_types: [...SUPPORTED_WEBHOOK_EVENT_TYPES],
            created_at: "2026-03-19T00:00:00.000Z",
            updated_at: "2026-03-19T00:00:00.000Z",
            disabled_at: null,
          },
          signing_secret: "whsec_123",
        },
        error: null,
      })
    );

    globalThis.fetch = fetchMock as typeof fetch;

    await createWebhookEndpoint({
      enabled: true,
      name: "Primary production webhook",
      subscribedEventTypes: [...SUPPORTED_WEBHOOK_EVENT_TYPES],
      url: "https://example.com/webhooks/kayle",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/endpoints",
      expect.objectContaining({
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    );

    const [, requestOptions] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(requestOptions?.body))).toEqual({
      enabled: true,
      name: "Primary production webhook",
      subscribed_event_types: SUPPORTED_WEBHOOK_EVENT_TYPES,
      url: "https://example.com/webhooks/kayle",
    });
  });

  test("deletes endpoints with the expected endpoint path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          message: "Webhook endpoint deleted.",
          status: "success",
        },
        error: null,
      })
    );

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(deleteWebhookEndpoint("whe_123")).resolves.toEqual({
      message: "Webhook endpoint deleted.",
      status: "success",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/endpoints/whe_123",
      expect.objectContaining({
        credentials: "include",
        method: "DELETE",
      })
    );
  });

  test("deactivates keys with the expected endpoint path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          id: "whk_123",
          webhook_endpoint_id: "whe_123",
          key_id: "demo-key",
          algorithm: "RSA-OAEP-256",
          key_type: "RSA",
          jwk: { e: "AQAB", kty: "RSA", n: "abc123" },
          is_active: false,
          created_at: "2026-03-19T00:00:00.000Z",
          updated_at: "2026-03-20T00:00:00.000Z",
          disabled_at: "2026-03-20T00:00:00.000Z",
        },
        error: null,
      })
    );

    globalThis.fetch = fetchMock as typeof fetch;

    await deactivateWebhookKey("whk_123");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/keys/whk_123/deactivate",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      })
    );
  });

  test("reactivates keys with the expected endpoint path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        data: {
          id: "whk_123",
          webhook_endpoint_id: "whe_123",
          key_id: "demo-key",
          algorithm: "RSA-OAEP-256",
          key_type: "RSA",
          jwk: { e: "AQAB", kty: "RSA", n: "abc123" },
          is_active: true,
          created_at: "2026-03-19T00:00:00.000Z",
          updated_at: "2026-03-21T00:00:00.000Z",
          disabled_at: null,
        },
        error: null,
      })
    );

    globalThis.fetch = fetchMock as typeof fetch;

    await reactivateWebhookKey("whk_123");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/keys/whk_123/reactivate",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      })
    );
  });
});
