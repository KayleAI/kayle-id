/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test } from "vitest";
import { useDevice } from "./use-device";

const hadWindowInitially = typeof window !== "undefined";
const originalUserAgent = hadWindowInitially ? window.navigator.userAgent : "";
const originalPlatform = hadWindowInitially ? window.navigator.platform : "";
const originalMaxTouchPoints = hadWindowInitially
  ? window.navigator.maxTouchPoints
  : 0;

function setNavigator({
  userAgent,
  platform = "MacIntel",
  maxTouchPoints = 0,
}: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}) {
  if (typeof window === "undefined") {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        navigator: {
          userAgent,
          platform,
          maxTouchPoints,
        },
      },
    });
    return;
  }

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

afterEach(() => {
  if (!hadWindowInitially) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  setNavigator({
    userAgent: originalUserAgent,
    platform: originalPlatform,
    maxTouchPoints: originalMaxTouchPoints,
  });
});

describe("useDevice", () => {
  test("iPhone browsers are routed to handoff UI", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    });

    expect(useDevice()).toEqual({
      supported: false,
      os: "ios",
    });
  });

  test("older iPhone browsers are also routed to handoff UI", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    });

    expect(useDevice()).toEqual({
      supported: false,
      os: "ios",
    });
  });

  test("Android is unsupported for this verify flow", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
    });

    expect(useDevice()).toEqual({
      supported: false,
      os: "android",
    });
  });
});
