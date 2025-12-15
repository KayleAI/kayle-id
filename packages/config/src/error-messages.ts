export const ERROR_MESSAGES = {
  UNKNOWN: {
    title: "Something went wrong",
    description:
      "We couldn't complete the verification due to an unexpected issue. Please try again.",
  },

  INVALID_SESSION_ID: {
    title: "Invalid verification link",
    description:
      "This verification link is not valid. Please restart the verification from the original source.",
  },

  SESSION_EXPIRED: {
    title: "Verification expired",
    description:
      "This verification session has expired for security reasons. Please restart the verification process.",
  },

  SESSION_NOT_FOUND: {
    title: "Verification not found",
    description:
      "This verification session is no longer available. Please restart the verification process.",
  },

  SESSION_IN_PROGRESS: {
    title: "Verification already in progress",
    description:
      "This verification is currently active on another device. Please continue on the device where you started the process.",
  },
} as const;
