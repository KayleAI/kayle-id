import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type z from "zod";
import type { Session } from "@/openapi/models/sessions";
import v1 from "@/v1";
import { setup, type TestData, teardown } from "./setup";

let TEST_DATA: TestData | undefined;

beforeAll(async () => {
  TEST_DATA = await setup();
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
});

let createdSessionId: string | undefined;

describe("/v1/sessions", () => {
  test.serial("Can create a session", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    const { data } = (await response.json()) as {
      data: z.infer<typeof Session>;
    };

    // Assert that we have a successful response
    expect(response.status).toBe(200);

    // Assert that we have a session
    expect(data).toBeDefined();
    expect(data?.id).toBeDefined();
    expect(data?.status).toBe("created");
    // The environment should be the same as the API key
    expect(data?.environment).toBe("test");
    // we expect redirect_url to be null because we didn't provide it
    // by not providing it, when the session is completed, it will
    //  default to the Kayle ID's success page
    expect(data?.redirect_url).toBeNull();
    expect(data?.verification_url).toBeDefined();
    expect(data?.contract_version).toBe(1);
    expect(data?.share_fields).toBeDefined();
    expect(data?.share_fields.kayle_document_id.required).toBe(true);

    // Store the created session ID for later use
    createdSessionId = data.id;
  });

  /**
   * Test whether we can receive a list of sessions
   */
  test.serial("Can list sessions", async () => {
    const response = await v1.request("/sessions", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    // Assert that we have a successful response
    expect(response.status).toBe(200);

    const { data } = (await response.json()) as {
      data: z.infer<typeof Session>[];
    };

    // Assert that we have a session
    expect(data).toBeDefined();
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.[0]?.id).toBeDefined();
    expect(data?.[0]?.status).toBe("created");

    // The environment should be the same as the API key, for all sessions
    expect(data?.every((session) => session.environment === "test")).toBe(true);

    // Assert that the created session is in the list
    expect(data?.some((session) => session.id === createdSessionId)).toBe(true);
  });

  test.serial("Can get a session by ID", async () => {
    if (!createdSessionId) {
      throw new Error("Created session ID is not defined");
    }

    const response = await v1.request(`/sessions/${createdSessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    // Assert that we have a successful response
    expect(response.status).toBe(200);

    const { data } = (await response.json()) as {
      data: z.infer<typeof Session>;
    };

    // Assert that the session is returned
    expect(data?.id).toBe(createdSessionId);
    expect(data?.contract_version).toBe(1);
    expect(data?.share_fields).toBeDefined();
  });

  test.serial("Can cancel a session by ID", async () => {
    const response = await v1.request(`/sessions/${createdSessionId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    // Assert that we have a successful response
    expect(response.status).toBe(204);

    // Assert that the session is cancelled
    const updatedSession = await v1.request(`/sessions/${createdSessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    const { data } = (await updatedSession.json()) as {
      data: z.infer<typeof Session>;
    };

    // Assert that the session is cancelled
    expect(data?.status).toBe("cancelled");
  });
});
