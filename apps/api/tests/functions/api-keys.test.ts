import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApiKey } from "@/functions/auth/create-api-key";
import { deleteApiKey } from "@/functions/auth/delete-api-key";
import { updateApiKey } from "@/functions/auth/update-api-key";
import { verifyApiKey } from "@/functions/auth/verify-api-key";
import { setup, type TestData, teardown } from "../setup";

let TEST_DATA: TestData | undefined;

const API_KEY_PREFIX_PATTERN = /^kk_live_/;

beforeAll(async () => {
  TEST_DATA = await setup();
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
});

describe("Handling API Keys", () => {
  /**
   * Test whether we can receive a list of events sent
   */
  test("Create API Key", async () => {
    const { apiKey } = await createApiKey({
      name: "Test API Key",
      organizationId: TEST_DATA?.organizationId as string,
    });

    // Assert that the API key is created
    expect(apiKey).toBeString();

    // Assert that the API key starts with the live prefix
    expect(apiKey).toMatch(API_KEY_PREFIX_PATTERN);

    // Assert that the API key is 32 + 8 (kk_live_) = 40 characters long
    expect(apiKey.length).toBe(40);
  });

  /**
   * Test whether we can verify an API key
   */
  test("Verify API Key", async () => {
    const { organizationId, enabled } = await verifyApiKey(
      TEST_DATA?.apiKey as string
    );

    // Assert that the organization ID is the same as the test organization ID
    expect(organizationId).toBe(TEST_DATA?.organizationId as string);

    // Assert that the API key is enabled (default setting)
    expect(enabled).toBe(true);
  });

  /**
   * Test whether we can delete an API key
   */
  test("Delete API Key", async () => {
    // create a new API key
    const { id, apiKey } = await createApiKey({
      name: "Test API Key",
      organizationId: TEST_DATA?.organizationId as string,
    });

    // delete the API key
    const { status } = await deleteApiKey(
      id,
      TEST_DATA?.organizationId as string
    );
    expect(status).toBe("success");

    // Ensure that the API key is deleted
    const { organizationId, enabled } = await verifyApiKey(apiKey);
    expect(organizationId).toBeNull();
    expect(enabled).toBeNull();
  });

  /**
   * Test whether we can update an API key
   */
  test("Update API Key", async () => {
    const { status } = await updateApiKey(
      TEST_DATA?.apiKeyId as string,
      TEST_DATA?.organizationId as string,
      {
        name: "Updated Test API Key",
        enabled: false,
      }
    );

    // Assert that the API key is updated
    expect(status).toBe("success");

    // Ensure the API key is disabled
    const { enabled } = await verifyApiKey(TEST_DATA?.apiKey as string);
    expect(enabled).toBe(false);
  });
});
