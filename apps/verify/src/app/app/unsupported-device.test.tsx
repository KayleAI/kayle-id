/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  HandoffPayload,
  VerifySessionStatusPayload,
} from "@/config/handoff";

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
const assignLocationSpy = vi.fn();
const requestHandoffPayloadMock = vi.fn();
const requestVerifySessionStatusMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useLoaderData: () => ({
    sessionId: "vs_test_session123",
  }),
}));

vi.mock("@/utils/use-device", () => ({
  useDevice: () => mockedUseDevice(),
}));

vi.mock("@/utils/navigation", () => ({
  redirectToUrl: (targetUrl: string) => assignLocationSpy(targetUrl),
}));

vi.mock("@/config/handoff", () => ({
  requestHandoffPayload: (sessionId: string) =>
    requestHandoffPayloadMock(sessionId),
  requestVerifySessionStatus: (sessionId: string) =>
    requestVerifySessionStatusMock(sessionId),
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

function createHandoffPayload(): HandoffPayload {
  return {
    v: 1,
    session_id: "vs_test_session123",
    attempt_id: "va_test_attempt123",
    mobile_write_token: "token_123",
    expires_at: "2099-01-01T00:00:00.000Z",
  };
}

function createSessionStatus(
  overrides: Partial<VerifySessionStatusPayload> = {}
): VerifySessionStatusPayload {
  return {
    completed_at: null,
    is_terminal: false,
    latest_attempt: {
      completed_at: null,
      failure_code: null,
      id: "va_test_attempt123",
      status: "in_progress",
    },
    redirect_url: null,
    session_id: "vs_test_session123",
    status: "created",
    ...overrides,
  };
}

async function settleUi(delayMs = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  });
}

beforeEach(() => {
  mockedUseDevice.mockReset();
  qrPropsSpy.mockReset();
  assignLocationSpy.mockReset();
  requestHandoffPayloadMock.mockReset();
  requestVerifySessionStatusMock.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("UnsupportedDevice", () => {
  test("fetches handoff payload and renders QR + iPhone CTA on iOS", async () => {
    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "ios",
    });

    requestHandoffPayloadMock.mockResolvedValue(createHandoffPayload());
    requestVerifySessionStatusMock.mockResolvedValue(createSessionStatus());

    const view = render(<UnsupportedDevice />);
    fireEvent.click(view.getByRole("button", { name: "Open on Mobile" }));

    await settleUi();
    await settleUi();

    expect(requestHandoffPayloadMock).toHaveBeenCalledWith(
      "vs_test_session123"
    );
    expect(requestVerifySessionStatusMock).toHaveBeenCalledWith(
      "vs_test_session123"
    );

    const qr = view.getByTestId("qr-code");
    const qrValue = qr.getAttribute("data-value");
    expect(qrValue).toContain("va_test_attempt123");
    expect(qrValue).toContain("token_123");

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

    requestHandoffPayloadMock.mockRejectedValue(
      new Error("Verification session is expired.")
    );
    requestVerifySessionStatusMock.mockResolvedValue(createSessionStatus());

    const view = render(<UnsupportedDevice />);
    fireEvent.click(view.getByRole("button", { name: "Open on Mobile" }));

    await settleUi();
    await settleUi();

    expect(
      view.getByText("Unable to generate handoff QR code.")
    ).not.toBeNull();

    expect(view.queryByTestId("qr-code")).toBeNull();
  });

  test("redirects after a terminal session status and appends session_id", async () => {
    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "unknown",
    });

    requestHandoffPayloadMock.mockResolvedValue(createHandoffPayload());
    requestVerifySessionStatusMock.mockResolvedValue(
      createSessionStatus({
        completed_at: "2099-01-01T00:00:00.000Z",
        is_terminal: true,
        latest_attempt: {
          completed_at: "2099-01-01T00:00:00.000Z",
          failure_code: null,
          id: "va_test_attempt123",
          status: "succeeded",
        },
        redirect_url: "https://example.com/return?foo=bar",
        status: "completed",
      })
    );

    const view = render(<UnsupportedDevice />);
    fireEvent.click(view.getByRole("button", { name: "Open on Mobile" }));

    await settleUi();
    await settleUi();

    expect(view.getByText("Verification complete")).not.toBeNull();
    expect(view.getByText("Continue now")).not.toBeNull();
    expect(view.getByText("Redirecting in 3 seconds.")).not.toBeNull();

    await settleUi(3100);

    expect(assignLocationSpy).toHaveBeenCalledWith(
      "https://example.com/return?foo=bar&session_id=vs_test_session123"
    );
  }, 8000);

  test("shows terminal completion state without redirect when redirect_url is absent", async () => {
    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "unknown",
    });

    requestHandoffPayloadMock.mockResolvedValue(createHandoffPayload());
    requestVerifySessionStatusMock.mockResolvedValue(
      createSessionStatus({
        completed_at: "2099-01-01T00:00:00.000Z",
        is_terminal: true,
        latest_attempt: {
          completed_at: "2099-01-01T00:00:00.000Z",
          failure_code: "selfie_face_mismatch",
          id: "va_test_attempt123",
          status: "failed",
        },
        redirect_url: null,
        status: "completed",
      })
    );

    const view = render(<UnsupportedDevice />);
    fireEvent.click(view.getByRole("button", { name: "Open on Mobile" }));

    await settleUi();
    await settleUi();

    expect(view.getByText("Verification failed")).not.toBeNull();
    expect(
      view.getByText(
        "The selfie evidence did not match the passport photo on the latest attempt."
      )
    ).not.toBeNull();
    expect(view.getByText("You can now close this page.")).not.toBeNull();

    expect(assignLocationSpy).not.toHaveBeenCalled();
    expect(view.queryByTestId("qr-code")).toBeNull();
  });
});
