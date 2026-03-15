/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

const mockedUseDevice = vi.fn();
const qrPropsSpy = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useLoaderData: () => ({
    sessionId: "vs_test_session123",
  }),
}));

vi.mock("@/utils/use-device", () => ({
  useDevice: () => mockedUseDevice(),
}));

vi.mock("@/config/env", () => ({
  getApiHttpBaseUrl: () => "https://api.example.test",
}));

vi.mock("@/components/info", () => ({
  default: ({
    buttons,
    header,
  }: {
    buttons: {
      primary: {
        label: string;
        onClick: () => void;
      };
    };
    header: {
      title: string;
    };
  }) => (
    <div>
      <h1>{header.title}</h1>
      <button onClick={buttons.primary.onClick} type="button">
        {buttons.primary.label}
      </button>
    </div>
  ),
}));

vi.mock("@kayleai/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => <>{open ? children : null}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => {
    qrPropsSpy(value);
    return <div data-testid="qr-code" data-value={value} />;
  },
}));

import { UnsupportedDevice } from "./unsupported-device";

beforeEach(() => {
  mockedUseDevice.mockReset();
  qrPropsSpy.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("UnsupportedDevice", () => {
  test("fetches handoff payload and renders QR + iPhone CTA on iOS", async () => {
    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "ios",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            v: 1,
            session_id: "vs_test_session123",
            attempt_id: "va_test_attempt123",
            mobile_write_token: "token_123",
            expires_at: "2099-01-01T00:00:00.000Z",
          },
          error: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const view = render(<UnsupportedDevice />);
    fireEvent.click(view.getByRole("button", { name: "Open on Mobile" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/v1/verify/session/vs_test_session123/handoff",
        {
          method: "POST",
        }
      );
    });

    await waitFor(() => {
      const qr = view.getByTestId("qr-code");
      const qrValue = qr.getAttribute("data-value");
      expect(qrValue).toContain("va_test_attempt123");
      expect(qrValue).toContain("token_123");
    });

    const openAppLink = view.getByRole("link", {
      name: "Open Kayle ID app",
    });
    expect(openAppLink.getAttribute("href")).toContain("kayle-id://");
  });

  test("renders failure state when handoff fetch fails", async () => {
    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "unknown",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          error: {
            code: "SESSION_EXPIRED",
            message: "Verification session is expired.",
          },
        }),
        {
          status: 410,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const view = render(<UnsupportedDevice />);
    fireEvent.click(view.getByRole("button", { name: "Open on Mobile" }));

    await waitFor(() => {
      expect(
        view.getByText("Unable to generate handoff QR code.")
      ).not.toBeNull();
    });

    expect(view.queryByTestId("qr-code")).toBeNull();
  });
});
