import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWebhookKey,
  listWebhookEndpoints,
  parseJwkInput,
  revealWebhookSigningSecret,
} from "./api";

afterEach(() => {
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

    vi.stubGlobal("fetch", fetchMock);

    await listWebhookEndpoints({
      environment: "live",
      limit: 10,
      startingAfter: "whe_123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/endpoints?environment=live&limit=10&starting_after=whe_123",
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

    vi.stubGlobal("fetch", fetchMock);

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

    vi.stubGlobal("fetch", fetchMock);

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
});
