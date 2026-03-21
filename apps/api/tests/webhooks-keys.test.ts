import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { file } from "bun";
import { exportJWK, importSPKI } from "jose";
import app from "@/index";
import { setup, type TestData, teardown } from "./setup";

let TEST_DATA: TestData | undefined;

beforeAll(async () => {
  TEST_DATA = await setup();
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
});

async function createEndpoint(): Promise<string> {
  const response = await app.request("/v1/webhooks/endpoints", {
    body: JSON.stringify({
      url: `https://example.com/webhooks/keys/${crypto.randomUUID()}`,
    }),
    headers: {
      Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json()) as {
    data: { endpoint: { id: string } };
    error: null;
  };

  return payload.data.endpoint.id;
}

async function loadPublicJwk(): Promise<JsonWebKey> {
  const publicKeyText = await file(
    new URL("../../../tests/secrets/rsa_public.pem", import.meta.url)
  ).text();
  const jwk = await exportJWK(await importSPKI(publicKeyText, "RSA-OAEP-256"));

  return {
    ...jwk,
    kty: jwk.kty ?? "RSA",
  };
}

describe("/v1/webhooks/keys", () => {
  test("creates, lists, deactivates, and reactivates webhook encryption keys", async () => {
    const endpointId = await createEndpoint();
    const publicJwk = await loadPublicJwk();

    const createResponse = await app.request(
      `/v1/webhooks/endpoints/${endpointId}/keys`,
      {
        body: JSON.stringify({
          key_id: "rsa-key-1",
          jwk: publicJwk,
          algorithm: "RSA-OAEP-256",
          key_type: "RSA",
        }),
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );

    expect(createResponse.status).toBe(200);

    const createPayload = (await createResponse.json()) as {
      data: {
        algorithm: string;
        id: string;
        is_active: boolean;
        jwk: JsonWebKey;
        key_id: string;
        key_type: string;
        webhook_endpoint_id: string;
      };
      error: null;
    };

    expect(createPayload.error).toBeNull();
    expect(createPayload.data.webhook_endpoint_id).toBe(endpointId);
    expect(createPayload.data.key_id).toBe("rsa-key-1");
    expect(createPayload.data.algorithm).toBe("RSA-OAEP-256");
    expect(createPayload.data.key_type).toBe("RSA");
    expect(createPayload.data.is_active).toBeTrue();
    expect(createPayload.data.jwk.kty).toBe("RSA");

    const listResponse = await app.request(
      `/v1/webhooks/endpoints/${endpointId}/keys?is_active=true&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "GET",
      }
    );

    expect(listResponse.status).toBe(200);

    const listPayload = (await listResponse.json()) as {
      data: Array<{
        id: string;
        is_active: boolean;
        key_id: string;
      }>;
      error: null;
      pagination: {
        has_more: boolean;
        limit: number;
        next_cursor: string | null;
      };
    };

    expect(listPayload.error).toBeNull();
    expect(listPayload.data).toHaveLength(1);
    expect(listPayload.data[0]?.id).toBe(createPayload.data.id);
    expect(listPayload.data[0]?.is_active).toBeTrue();
    expect(listPayload.pagination.has_more).toBeFalse();

    const deactivateResponse = await app.request(
      `/v1/webhooks/keys/${createPayload.data.id}/deactivate`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "POST",
      }
    );

    expect(deactivateResponse.status).toBe(200);

    const deactivatePayload = (await deactivateResponse.json()) as {
      data: {
        disabled_at: string | null;
        id: string;
        is_active: boolean;
      };
      error: null;
    };

    expect(deactivatePayload.error).toBeNull();
    expect(deactivatePayload.data.id).toBe(createPayload.data.id);
    expect(deactivatePayload.data.is_active).toBeFalse();
    expect(deactivatePayload.data.disabled_at).toBeString();

    const inactiveListResponse = await app.request(
      `/v1/webhooks/endpoints/${endpointId}/keys?is_active=false&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "GET",
      }
    );

    expect(inactiveListResponse.status).toBe(200);

    const inactiveListPayload = (await inactiveListResponse.json()) as {
      data: Array<{
        id: string;
        is_active: boolean;
      }>;
      error: null;
      pagination: {
        has_more: boolean;
        limit: number;
        next_cursor: string | null;
      };
    };

    expect(inactiveListPayload.error).toBeNull();
    expect(inactiveListPayload.data).toHaveLength(1);
    expect(inactiveListPayload.data[0]?.id).toBe(createPayload.data.id);
    expect(inactiveListPayload.data[0]?.is_active).toBeFalse();

    const reactivateResponse = await app.request(
      `/v1/webhooks/keys/${createPayload.data.id}/reactivate`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "POST",
      }
    );

    expect(reactivateResponse.status).toBe(200);

    const reactivatePayload = (await reactivateResponse.json()) as {
      data: {
        disabled_at: string | null;
        id: string;
        is_active: boolean;
      };
      error: null;
    };

    expect(reactivatePayload.error).toBeNull();
    expect(reactivatePayload.data.id).toBe(createPayload.data.id);
    expect(reactivatePayload.data.is_active).toBeTrue();
    expect(reactivatePayload.data.disabled_at).toBeNull();

    const reactivatedListResponse = await app.request(
      `/v1/webhooks/endpoints/${endpointId}/keys?is_active=true&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "GET",
      }
    );

    expect(reactivatedListResponse.status).toBe(200);

    const reactivatedListPayload = (await reactivatedListResponse.json()) as {
      data: Array<{
        id: string;
        is_active: boolean;
      }>;
      error: null;
      pagination: {
        has_more: boolean;
        limit: number;
        next_cursor: string | null;
      };
    };

    expect(reactivatedListPayload.error).toBeNull();
    expect(reactivatedListPayload.data).toHaveLength(1);
    expect(reactivatedListPayload.data[0]?.id).toBe(createPayload.data.id);
    expect(reactivatedListPayload.data[0]?.is_active).toBeTrue();
  });
});
