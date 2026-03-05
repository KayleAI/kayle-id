/**
 * @vitest-environment jsdom
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SessionProvider, useSession } from "./session-provider";

if (typeof document === "undefined") {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: dom.window.HTMLElement,
  });
  Object.defineProperty(globalThis, "Node", {
    configurable: true,
    value: dom.window.Node,
  });
  Object.defineProperty(globalThis, "MutationObserver", {
    configurable: true,
    value: dom.window.MutationObserver,
  });
}

const sessionId =
  "vs_test_phase3provider0000000000000000000000000000000000000000000000000000000000";

function setNavigator({
  userAgent,
  platform = "iPhone",
  maxTouchPoints = 5,
}: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    value: maxTouchPoints,
  });
}

function SessionStateProbe() {
  const { session, error } = useSession();

  return (
    <div>
      <div data-testid="session-state">{session ? "ready" : "idle"}</div>
      <div data-testid="session-error">{error?.code ?? "none"}</div>
    </div>
  );
}

function renderProvider() {
  return render(
    <SessionProvider sessionId={sessionId}>
      <SessionStateProbe />
    </SessionProvider>
  );
}

function buildSessionStub(overrides?: {
  connect?: () => Promise<void>;
  ping?: () => Promise<string>;
  close?: () => void;
}) {
  return {
    connect: overrides?.connect ?? vi.fn().mockResolvedValue(undefined),
    ping: overrides?.ping ?? vi.fn().mockResolvedValue("phase_ok"),
    notifyUnsupportedDevice: vi.fn().mockResolvedValue("phase_ok"),
    sendPhase: vi.fn().mockResolvedValue("phase_ok"),
    sendData: vi.fn().mockResolvedValue("phase_ok"),
    close: overrides?.close ?? vi.fn(),
  };
}

function createErrorWithCode(
  code: string,
  message: string
): Error & {
  code: string;
} {
  const error = new Error(message) as Error & {
    code: string;
  };
  error.code = code;
  return error;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SessionProvider", () => {
  test("does not bootstrap websocket on unsupported devices", async () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 0,
    });

    const handoffModule = await import("@/config/handoff");
    const capnpModule = await import("@/config/capnp");
    const handoffSpy = vi.spyOn(handoffModule, "requestHandoffPayload");
    const initialiseSpy = vi.spyOn(capnpModule, "initialiseSession");

    const view = renderProvider();

    await waitFor(() => {
      expect(view.getByTestId("session-state").textContent).toBe("idle");
    });

    expect(handoffSpy).not.toHaveBeenCalled();
    expect(initialiseSpy).not.toHaveBeenCalled();
  });

  test("bootstraps authenticated hello on supported iPhone flow", async () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    const handoffModule = await import("@/config/handoff");
    const capnpModule = await import("@/config/capnp");
    const handoffSpy = vi
      .spyOn(handoffModule, "requestHandoffPayload")
      .mockResolvedValue({
        v: 1,
        session_id: sessionId,
        attempt_id:
          "va_test_attemptprovider0000000000000000000000000000000000000000000000000000000000",
        mobile_write_token: "token_provider_123",
        expires_at: "2099-01-01T00:00:00.000Z",
      });

    const connect = vi.fn().mockResolvedValue(undefined);
    const ping = vi.fn().mockResolvedValue("phase_ok");
    const initialiseSpy = vi
      .spyOn(capnpModule, "initialiseSession")
      .mockReturnValue(buildSessionStub({ connect, ping }));

    const randomUUIDSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-0000-0000-000000000123");

    const view = renderProvider();

    await waitFor(() => {
      expect(handoffSpy).toHaveBeenCalledWith(sessionId);
    });

    await waitFor(() => {
      expect(connect).toHaveBeenCalledTimes(1);
      expect(ping).toHaveBeenCalledTimes(1);
      expect(view.getByTestId("session-state").textContent).toBe("ready");
    });

    const firstCallArg = initialiseSpy.mock.calls[0]?.[0];
    if (!firstCallArg?.helloCredentials) {
      throw new Error(
        "initialiseSession was not called with hello credentials"
      );
    }
    const { helloCredentials } = firstCallArg;

    expect(helloCredentials.attemptId).toBe(
      "va_test_attemptprovider0000000000000000000000000000000000000000000000000000000000"
    );
    expect(helloCredentials.mobileWriteToken).toBe("token_provider_123");
    expect(helloCredentials.deviceId).toBe(
      "web-00000000-0000-0000-0000-000000000123"
    );
    expect(helloCredentials.appVersion).toBe("verify-web");

    randomUUIDSpy.mockRestore();
  });

  test("surfaces websocket auth bootstrap failures through session error state", async () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    const handoffModule = await import("@/config/handoff");
    const capnpModule = await import("@/config/capnp");

    vi.spyOn(handoffModule, "requestHandoffPayload").mockResolvedValue({
      v: 1,
      session_id: sessionId,
      attempt_id:
        "va_test_attemptprovider0000000000000000000000000000000000000000000000000000000000",
      mobile_write_token: "token_provider_123",
      expires_at: "2099-01-01T00:00:00.000Z",
    });

    vi.spyOn(capnpModule, "initialiseSession").mockImplementation(
      (
        _: unknown,
        onError?: (error: { code: string; message: string }) => void
      ) => {
        const connect = vi.fn().mockImplementation(() => {
          const error = createErrorWithCode(
            "HANDOFF_TOKEN_INVALID",
            "Invalid handoff token."
          );
          onError?.({ code: error.code, message: error.message });
          return Promise.reject(error);
        });
        return buildSessionStub({ connect });
      }
    );

    const view = renderProvider();

    await waitFor(() => {
      expect(view.getByTestId("session-error").textContent).toBe(
        "HANDOFF_TOKEN_INVALID"
      );
    });
  });
});
