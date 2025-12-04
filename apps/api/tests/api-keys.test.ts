import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import apiKeys from "@/auth/api-keys";
import { setup, TEST_DATA, teardown } from "./setup.test";

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  await teardown();
});

describe("API Key Endpoints", () => {
  /**
   * Test whether we can get a list of API keys
   */
  test.todo("List of API Keys", async () => {
    const response = await apiKeys.request("/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    // Assert that we have a successful response
    expect(response.status).toBe(200);

    const { data } = (await response.json()) as { data: any[] };

    // Assert that we have at least one API key
    expect(data?.length).toBeGreaterThan(0);
  });

  /**
   * Test whether we can create a new API key
   */
  test("Ensure API Keys cannot be listed using an API key", async () => {
    const response = await apiKeys.request("/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    // Assert that we have a forbidden response
    expect(response.status).toBe(403);
  });
});
