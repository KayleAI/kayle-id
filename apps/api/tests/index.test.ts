import { describe, expect, test } from "bun:test";
import app from "@/index";

/**
 * Test whether we can receive a healthy response from the root endpoint
 *
 * @note This test just confirms that the API is healthy and can be reached.
 */
describe("/", () => {
  test("GET /", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
  });
});
