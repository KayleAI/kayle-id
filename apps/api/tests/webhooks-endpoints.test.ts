import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SUPPORTED_WEBHOOK_EVENT_TYPES } from "@kayle-id/config/webhook-events";
import { db } from "@kayle-id/database/drizzle";
import { webhook_endpoints } from "@kayle-id/database/schema/webhooks";
import { eq } from "drizzle-orm";
import app from "@/index";
import { setup, type TestData, teardown } from "./setup";

let TEST_DATA: TestData | undefined;
const UPDATED_WEBHOOK_EVENT_TYPES = [
  "verification.attempt.failed",
  "verification.session.expired",
] as const;

beforeAll(async () => {
  TEST_DATA = await setup();
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
});

describe("/v1/webhooks/endpoints", () => {
  test("creates an endpoint, returns the signing secret once, and persists subscriptions", async () => {
    const response = await app.request("/v1/webhooks/endpoints", {
      body: JSON.stringify({
        name: "Primary verification webhook",
        subscribed_event_types: [...SUPPORTED_WEBHOOK_EVENT_TYPES],
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
          name: string | null;
          subscribed_event_types: string[];
        };
        signing_secret: string;
      };
      error: null;
    };

    expect(payload.error).toBeNull();
    expect(payload.data.endpoint.name).toBe("Primary verification webhook");
    expect(payload.data.endpoint.subscribed_event_types).toEqual(
      SUPPORTED_WEBHOOK_EVENT_TYPES
    );
    expect(payload.data.signing_secret.startsWith("whsec_")).toBeTrue();
    expect(payload.data.signing_secret).toHaveLength(38);

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
        name: string | null;
        signing_secret?: string;
        subscribed_event_types: string[];
      };
      error: null;
    };

    expect(getPayload.data.id).toBe(payload.data.endpoint.id);
    expect(getPayload.data.name).toBe("Primary verification webhook");
    expect(getPayload.data.subscribed_event_types).toEqual(
      SUPPORTED_WEBHOOK_EVENT_TYPES
    );
    expect("signing_secret" in getPayload.data).toBeFalse();
  });

  test("rotates the signing secret for an endpoint", async () => {
    const createResponse = await app.request("/v1/webhooks/endpoints", {
      body: JSON.stringify({
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
    expect(rotatePayload.data.signing_secret).toHaveLength(38);
  });

  test("reveals the current signing secret for an endpoint", async () => {
    const createResponse = await app.request("/v1/webhooks/endpoints", {
      body: JSON.stringify({
        url: "https://example.com/webhooks/kayle/reveal",
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

    const revealResponse = await app.request(
      `/v1/webhooks/endpoints/${createdPayload.data.endpoint.id}/signing-secret/reveal`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "POST",
      }
    );

    expect(revealResponse.status).toBe(200);

    const revealPayload = (await revealResponse.json()) as {
      data: {
        endpoint_id: string;
        signing_secret: string;
      };
      error: null;
    };

    expect(revealPayload.error).toBeNull();
    expect(revealPayload.data.endpoint_id).toBe(
      createdPayload.data.endpoint.id
    );
    expect(revealPayload.data.signing_secret).toBe(
      createdPayload.data.signing_secret
    );
    expect(revealPayload.data.signing_secret).toHaveLength(38);
  });

  test("returns 500 when the signing secret cannot be decrypted", async () => {
    const createResponse = await app.request("/v1/webhooks/endpoints", {
      body: JSON.stringify({
        url: "https://example.com/webhooks/kayle/broken-secret",
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
      };
      error: null;
    };

    await db
      .update(webhook_endpoints)
      .set({
        signingSecretCiphertext: "not-a-valid-ciphertext",
      })
      .where(eq(webhook_endpoints.id, createdPayload.data.endpoint.id));

    const revealResponse = await app.request(
      `/v1/webhooks/endpoints/${createdPayload.data.endpoint.id}/signing-secret/reveal`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "POST",
      }
    );

    expect(revealResponse.status).toBe(500);
  });

  test("updates endpoint name, url, enabled state, and subscriptions", async () => {
    const createResponse = await app.request("/v1/webhooks/endpoints", {
      body: JSON.stringify({
        name: "Before rename",
        subscribed_event_types: [...SUPPORTED_WEBHOOK_EVENT_TYPES],
        url: "https://example.com/webhooks/kayle/update-before",
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
      };
      error: null;
    };

    const updateResponse = await app.request(
      `/v1/webhooks/endpoints/${createdPayload.data.endpoint.id}`,
      {
        body: JSON.stringify({
          name: "After rename",
          url: "https://example.com/webhooks/kayle/update-after",
          enabled: false,
          subscribed_event_types: UPDATED_WEBHOOK_EVENT_TYPES,
        }),
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "PATCH",
      }
    );

    expect(updateResponse.status).toBe(200);

    const updatePayload = (await updateResponse.json()) as {
      data: {
        disabled_at: string | null;
        enabled: boolean;
        name: string | null;
        subscribed_event_types: string[];
        url: string;
      };
      error: null;
    };

    expect(updatePayload.error).toBeNull();
    expect(updatePayload.data.name).toBe("After rename");
    expect(updatePayload.data.url).toBe(
      "https://example.com/webhooks/kayle/update-after"
    );
    expect(updatePayload.data.enabled).toBeFalse();
    expect(updatePayload.data.disabled_at).toBeString();
    expect(updatePayload.data.subscribed_event_types).toEqual(
      UPDATED_WEBHOOK_EVENT_TYPES
    );

    const listResponse = await app.request(
      "/v1/webhooks/endpoints?enabled=false&limit=10",
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
        enabled: boolean;
        id: string;
      }>;
      error: null;
      pagination: {
        has_more: boolean;
        limit: number;
        next_cursor: string | null;
      };
    };

    expect(listPayload.error).toBeNull();
    expect(
      listPayload.data.some(
        (endpoint) =>
          endpoint.id === createdPayload.data.endpoint.id &&
          endpoint.enabled === false
      )
    ).toBeTrue();
  });

  test("deletes an endpoint and returns not found afterwards", async () => {
    const createResponse = await app.request("/v1/webhooks/endpoints", {
      body: JSON.stringify({
        url: "https://example.com/webhooks/kayle/delete-me",
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
      };
      error: null;
    };

    const deleteResponse = await app.request(
      `/v1/webhooks/endpoints/${createdPayload.data.endpoint.id}`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
        method: "DELETE",
      }
    );

    expect(deleteResponse.status).toBe(200);

    const deletePayload = (await deleteResponse.json()) as {
      data: {
        message: string;
        status: "success";
      };
      error: null;
    };

    expect(deletePayload.error).toBeNull();
    expect(deletePayload.data.status).toBe("success");

    const [deletedRow] = await db
      .select()
      .from(webhook_endpoints)
      .where(eq(webhook_endpoints.id, createdPayload.data.endpoint.id))
      .limit(1);

    expect(deletedRow).toBeUndefined();

    const getResponse = await app.request(
      `/v1/webhooks/endpoints/${createdPayload.data.endpoint.id}`,
      {
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
      }
    );

    expect(getResponse.status).toBe(404);
  });
});
