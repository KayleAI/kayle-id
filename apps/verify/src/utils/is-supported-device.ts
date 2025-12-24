const IOS_VERSION_MATCH = /OS (\d+)[._]/;
const ANDROID_VERSION_MATCH = /Android (\d+)(?:\.\d+)?/;
const IOS_PHONE_MATCH = /iPhone/;
const IPAD_MATCH = /iPad/;

/**
 * Policy:
 * - iOS >= 16 supported
 * - Android >= 8 supported
 */
export function isSupportedDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const nav = window.navigator;
  const ua = nav.userAgent;

  // iPhone only
  const iosVersionMatch = ua?.match(IOS_VERSION_MATCH);
  const isIPhone = IOS_PHONE_MATCH.test(ua);

  if (iosVersionMatch && isIPhone) {
    const major = Number(iosVersionMatch[1]);
    return major >= 16;
  }

  // Explicitly reject iPads (desktop or mobile UA)
  const isIPad =
    IPAD_MATCH.test(ua) ||
    (nav?.platform === "MacIntel" && nav?.maxTouchPoints > 1);

  if (isIPad) {
    return false;
  }

  // Android phones
  const androidMatch = ua?.match(ANDROID_VERSION_MATCH);
  if (androidMatch) {
    const major = Number(androidMatch[1]);
    return major >= 8;
  }

  return false;
}
