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

  HELLO_AUTH_REQUIRED: {
    title: "Authentication required",
    description:
      "This verification connection is missing required credentials. Please restart from the latest verification link.",
  },

  ATTEMPT_NOT_FOUND: {
    title: "Verification attempt not found",
    description:
      "This verification attempt is no longer available. Please restart the verification process.",
  },

  HANDOFF_TOKEN_INVALID: {
    title: "Invalid mobile handoff token",
    description:
      "This handoff credential is not valid. Please restart the verification flow from your browser.",
  },

  HANDOFF_TOKEN_EXPIRED: {
    title: "Mobile handoff token expired",
    description:
      "This handoff credential has expired. Please generate a new QR handoff from your browser.",
  },

  HANDOFF_TOKEN_CONSUMED: {
    title: "Handoff token already used",
    description:
      "This handoff credential was already used. Please continue on your original device or restart the flow.",
  },

  HANDOFF_DEVICE_MISMATCH: {
    title: "Wrong device for resume",
    description:
      "This verification attempt is bound to a different device. Continue on that device or start over.",
  },

  ATTEMPT_CONNECTION_ACTIVE: {
    title: "Verification already connected",
    description:
      "This verification attempt is already active on another connection. Continue there or retry after it closes.",
  },

  PHASE_OUT_OF_ORDER: {
    title: "Step order mismatch",
    description:
      "This verification step was sent out of order. Continue from the current step.",
  },

  NFC_DATA_PHASE_REQUIRED: {
    title: "NFC upload not ready",
    description:
      "NFC data can only be uploaded during the NFC reading step. Continue from the current step.",
  },

  DATA_CHUNK_RETRY: {
    title: "Retry upload chunk",
    description:
      "A data chunk needs to be retried. Continue uploading from the current verification step.",
  },

  NFC_REQUIRED_DATA_MISSING: {
    title: "NFC data missing",
    description:
      "Required passport chip data is still missing. Continue the NFC upload before finishing this step.",
  },
} as const;
