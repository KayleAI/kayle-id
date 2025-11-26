import { describe, expect, test } from "bun:test";
import sessions from "@/v1/sessions";

describe("/v1/sessions", () => {
  /**
   * Test whether we can receive a list of sessions
   */
  test.todo("GET /", async () => {
    const response = await sessions.request("/", {
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
