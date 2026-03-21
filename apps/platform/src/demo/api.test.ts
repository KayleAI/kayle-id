import { SUPPORTED_WEBHOOK_EVENT_TYPES } from "@kayle-id/config/webhook-events";
import { afterEach, expect, test, vi } from "vitest";
import { buildDemoWebhookUrl, createDemoWebhookEndpoint } from "./api";

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

test("createDemoWebhookEndpoint subscribes the demo to every supported public event", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    Response.json({
      data: {
        endpoint: {
          id: "whe_demo_test",
        },
        signing_secret: "whsec_demo_test",
      },
      error: null,
    })
  );

  await createDemoWebhookEndpoint({
    bindings: {
      API: {
        fetch: fetchMock,
      },
      KAYLE_DEMO_API_KEY: "demo_api_key",
    },
    request: new Request("https://kayle.id/api/demo/runs", {
      method: "POST",
    }),
    runId: "demo_123",
    token: "token_123",
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);

  const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

  expect(url).toBe("http://api/v1/webhooks/endpoints");
  expect(requestInit?.method).toBe("POST");
  expect(JSON.parse(String(requestInit?.body))).toEqual({
    enabled: true,
    subscribed_event_types: [...SUPPORTED_WEBHOOK_EVENT_TYPES],
    url: "http://127.0.0.1:3001/api/demo/webhooks/demo_123/token_123",
  });
});
