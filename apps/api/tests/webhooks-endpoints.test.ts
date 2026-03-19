import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import app from "@/index";
import { setup, TEST_DATA, teardown } from "./setup";

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  await teardown();
});

describe("/v1/webhooks/endpoints", () => {
  test("creates an endpoint, returns the signing secret once, and persists subscriptions", async () => {
    const response = await app.request("/v1/webhooks/endpoints", {
      body: JSON.stringify({
        environment: "test",
        subscribed_event_types: ["verification.attempt.succeeded"],
        url: "https://example.com/webhooks/kayle",
      }),
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      data: {
        endpoint: {
          id: string;
          subscribed_event_types: string[];
        };
        signing_secret: string;
      };
      error: null;
    };

    expect(payload.error).toBeNull();
    expect(payload.data.endpoint.subscribed_event_types).toEqual([
      "verification.attempt.succeeded",
    ]);
    expect(payload.data.signing_secret.startsWith("whsec_")).toBeTrue();

    const getResponse = await app.request(
      `/v1/webhooks/endpoints/${payload.data.endpoint.id}`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
      }
    );

    expect(getResponse.status).toBe(200);

    const getPayload = (await getResponse.json()) as {
      data: {
        id: string;
        signing_secret?: string;
        subscribed_event_types: string[];
      };
      error: null;
    };

    expect(getPayload.data.id).toBe(payload.data.endpoint.id);
    expect(getPayload.data.subscribed_event_types).toEqual([
      "verification.attempt.succeeded",
    ]);
    expect("signing_secret" in getPayload.data).toBeFalse();
  });

  test("rotates the signing secret for an endpoint", async () => {
    const createResponse = await app.request("/v1/webhooks/endpoints", {
      body: JSON.stringify({
        environment: "test",
        url: "https://example.com/webhooks/kayle/rotate",
      }),
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const createdPayload = (await createResponse.json()) as {
      data: {
        endpoint: {
          id: string;
        };
        signing_secret: string;
      };
      error: null;
    };

    const rotateResponse = await app.request(
      `/v1/webhooks/endpoints/${createdPayload.data.endpoint.id}/signing-secret/rotate`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "POST",
      }
    );

    expect(rotateResponse.status).toBe(200);

    const rotatePayload = (await rotateResponse.json()) as {
      data: {
        endpoint_id: string;
        signing_secret: string;
      };
      error: null;
    };

    expect(rotatePayload.data.endpoint_id).toBe(
      createdPayload.data.endpoint.id
    );
    expect(rotatePayload.data.signing_secret).not.toBe(
      createdPayload.data.signing_secret
    );
  });
});
