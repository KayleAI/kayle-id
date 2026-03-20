import { afterEach, expect, test } from "vitest";
import { buildDemoWebhookUrl } from "./api";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

test("buildDemoWebhookUrl uses the local HTTP proxy in development", () => {
  process.env.NODE_ENV = "development";

  expect(
    buildDemoWebhookUrl({
      request: new Request("https://localhost:3000/api/demo/runs"),
      runId: "demo_123",
      token: "token_123",
    })
  ).toBe("http://127.0.0.1:3001/api/demo/webhooks/demo_123/token_123");
});

test("buildDemoWebhookUrl keeps the request origin in production", () => {
  process.env.NODE_ENV = "production";

  expect(
    buildDemoWebhookUrl({
      request: new Request("https://kayle.id/api/demo/runs"),
      runId: "demo_123",
      token: "token_123",
    })
  ).toBe("https://kayle.id/api/demo/webhooks/demo_123/token_123");
});
