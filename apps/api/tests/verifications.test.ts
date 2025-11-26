import { describe, expect, test } from "bun:test";
import verifications from "@/v1/verifications";

describe("/v1/verifications", () => {
  /**
   * Test whether we can receive a list of verifications
   */
  test.todo("GET /", async () => {
    const response = await verifications.request("/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // TODO: Use a test API key
        Authorization: `Bearer ${process.env.TEST_API_KEY}`,
      },
    });

    // Assert that we have a successful response
    expect(response.status).toBe(200);
  });
});
