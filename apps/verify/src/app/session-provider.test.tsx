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

  test("does not bootstrap websocket on iPhone handoff flow", async () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
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

  test("does not surface websocket bootstrap errors on iPhone handoff flow", async () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    const handoffModule = await import("@/config/handoff");
    const capnpModule = await import("@/config/capnp");
    const handoffSpy = vi.spyOn(handoffModule, "requestHandoffPayload");
    const initialiseSpy = vi.spyOn(capnpModule, "initialiseSession");

    const view = renderProvider();

    await waitFor(() => {
      expect(view.getByTestId("session-error").textContent).toBe("none");
    });

    expect(handoffSpy).not.toHaveBeenCalled();
    expect(initialiseSpy).not.toHaveBeenCalled();
  });
});
