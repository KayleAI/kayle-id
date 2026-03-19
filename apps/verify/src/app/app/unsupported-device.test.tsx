/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
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
const REDIRECT_COUNTDOWN_TEXT = /Redirecting in 3 seconds\./;
const CLOSE_PAGE_TEXT = /You can now close this page\./;

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

vi.mock("@kayleai/ui/button", () => ({
  Button: ({
    children,
    nativeButton = true,
    onClick,
    render: renderNode,
    type = "button",
  }: {
    children: React.ReactNode;
    nativeButton?: boolean;
    onClick?: () => void;
    render?: React.ReactNode;
    type?: "button" | "submit";
  }) => {
    const linkRender = renderNode;

    return nativeButton === false && linkRender ? (
      linkRender
    ) : (
      <button onClick={onClick} type={type}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/components/info", () => ({
  default: ({
    buttons,
    children,
    header,
    message,
  }: {
    buttons?: {
      primary?: {
        label: string;
        onClick?: () => void;
      };
      secondary?: {
        label: string;
        onClick?: () => void;
      };
    };
    children?: React.ReactNode;
    header: {
      description: string;
      title: string;
    };
    message: {
      description: string;
      title: string;
    };
  }) => (
    <div>
      <h1>{header.title}</h1>
      <p>{header.description}</p>
      <h2>{message.title}</h2>
      <p>{message.description}</p>
      {children}
      {buttons?.primary ? (
        <button onClick={buttons.primary.onClick} type="button">
          {buttons.primary.label}
        </button>
      ) : null}
      {buttons?.secondary ? (
        <button onClick={buttons.secondary.onClick} type="button">
          {buttons.secondary.label}
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => {
    qrPropsSpy(value);
    return <div data-testid="qr-code" data-value={value} />;
  },
}));

import { UnsupportedDevice } from "./unsupported-device";

function createHandoffPayload(
  overrides: Partial<HandoffPayload> = {}
): HandoffPayload {
  return {
    v: 1,
    session_id: "vs_test_session123",
    attempt_id: "va_test_attempt123",
    mobile_write_token: "token_123",
    expires_at: "2099-01-01T00:00:00.000Z",
    ...overrides,
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

function createVerifyRequestError(
  code: string,
  message: string
): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

async function flushUi(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
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
  test("renders the inline handoff screen on entry instead of an unsupported-device dialog", async () => {
    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "ios",
    });

    requestHandoffPayloadMock.mockResolvedValue(createHandoffPayload());
    requestVerifySessionStatusMock.mockResolvedValue(createSessionStatus());

    const view = render(<UnsupportedDevice />);

    expect(await view.findByText("Open Kayle ID on your phone")).not.toBeNull();
    expect(view.queryByText("Unsupported Device")).toBeNull();

    await waitFor(() => {
      expect(requestHandoffPayloadMock).toHaveBeenCalledWith(
        "vs_test_session123"
      );
      expect(requestVerifySessionStatusMock).toHaveBeenCalledWith(
        "vs_test_session123"
      );
    });

    const qr = await view.findByTestId("qr-code");
    const qrValue = qr.getAttribute("data-value");
    expect(qrValue).toContain("va_test_attempt123");
    expect(qrValue).toContain("token_123");

    const openAppLink = view.getByRole("link", {
      name: "Open Kayle ID app",
    });
    expect(openAppLink.getAttribute("href")).toContain("kayle-id://");
    expect(view.getByRole("button", { name: "Cancel" })).not.toBeNull();
  });

  test("hides the handoff QR code once the mobile device connects", async () => {
    vi.useFakeTimers();

    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "unknown",
    });

    requestHandoffPayloadMock.mockResolvedValue(createHandoffPayload());
    requestVerifySessionStatusMock
      .mockResolvedValueOnce(createSessionStatus())
      .mockResolvedValueOnce(
        createSessionStatus({
          status: "in_progress",
        })
      );

    const view = render(<UnsupportedDevice />);

    await flushUi();
    expect(view.getByTestId("qr-code")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    await flushUi();

    expect(
      view.getByText(
        "Your mobile device is now connected to this verification session."
      )
    ).not.toBeNull();
    expect(view.queryByTestId("qr-code")).toBeNull();
  });

  test("refreshes the handoff QR every 60 seconds while waiting for a device", async () => {
    vi.useFakeTimers();

    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "unknown",
    });

    requestHandoffPayloadMock
      .mockResolvedValueOnce(
        createHandoffPayload({
          attempt_id: "va_test_attempt_initial",
          mobile_write_token: "token_initial",
        })
      )
      .mockResolvedValueOnce(
        createHandoffPayload({
          attempt_id: "va_test_attempt_refreshed",
          mobile_write_token: "token_refreshed",
        })
      );
    requestVerifySessionStatusMock.mockResolvedValue(createSessionStatus());

    const view = render(<UnsupportedDevice />);

    await flushUi();
    expect(view.getByTestId("qr-code").getAttribute("data-value")).toContain(
      "va_test_attempt_initial"
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    await flushUi();

    expect(requestHandoffPayloadMock).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("qr-code").getAttribute("data-value")).toContain(
      "va_test_attempt_refreshed"
    );
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

    expect(
      await view.findByText("Unable to generate handoff QR code.")
    ).not.toBeNull();
    expect(view.getByRole("button", { name: "Cancel" })).not.toBeNull();
    expect(view.queryByTestId("qr-code")).toBeNull();
  });

  test("redirects after a terminal session status and appends session_id", async () => {
    vi.useFakeTimers();

    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "unknown",
    });

    requestHandoffPayloadMock.mockRejectedValue(
      createVerifyRequestError(
        "SESSION_EXPIRED",
        "The verification session has already finished."
      )
    );
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

    await flushUi();
    expect(
      view.getByText("You can continue now or wait for the automatic redirect.")
    ).not.toBeNull();
    expect(view.getByText("Continue now")).not.toBeNull();
    expect(view.getByText(REDIRECT_COUNTDOWN_TEXT)).not.toBeNull();
    expect(view.queryByTestId("qr-code")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await flushUi();

    expect(assignLocationSpy).toHaveBeenCalledWith(
      "https://example.com/return?foo=bar&session_id=vs_test_session123"
    );
  });

  test("shows terminal failure state without redirect when redirect_url is absent", async () => {
    mockedUseDevice.mockReturnValue({
      supported: false,
      os: "unknown",
    });

    requestHandoffPayloadMock.mockRejectedValue(
      createVerifyRequestError(
        "SESSION_EXPIRED",
        "The verification session has already finished."
      )
    );
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

    expect(await view.findByText(CLOSE_PAGE_TEXT)).not.toBeNull();
    expect(view.getByText(CLOSE_PAGE_TEXT)).not.toBeNull();
    expect(assignLocationSpy).not.toHaveBeenCalled();
    expect(view.queryByTestId("qr-code")).toBeNull();
  });
});
