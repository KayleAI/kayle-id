const ANDROID_VERSION_MATCH = /Android (\d+)(?:\.\d+)?/;
const IOS_PHONE_MATCH = /iPhone/;
const IPAD_MATCH = /iPad/;

/**
 * Policy:
 * - Verify URLs always hand off into the iOS app
 * - Browsers are unsupported clients for completing the verification flow
 */
export function useDevice(): {
  supported: boolean;
  os: "ios" | "android" | "unknown";
} {
  if (typeof window === "undefined") {
    return { supported: false, os: "unknown" };
  }

  const nav = window.navigator;
  const ua = nav.userAgent;

  const isIPhone = IOS_PHONE_MATCH.test(ua);

  if (isIPhone) {
    return { supported: false, os: "ios" };
  }

  // Explicitly reject iPads (desktop or mobile UA)
  const isIPad =
    IPAD_MATCH.test(ua) ||
    (nav?.platform === "MacIntel" && nav?.maxTouchPoints > 1);

  if (isIPad) {
    return { supported: false, os: "unknown" };
  }

  // Android phones
  const androidMatch = ua?.match(ANDROID_VERSION_MATCH);
  if (androidMatch) {
    return { supported: false, os: "android" };
  }

  return { supported: false, os: "unknown" };
}
