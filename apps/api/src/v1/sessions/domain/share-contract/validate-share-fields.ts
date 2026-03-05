import {
  isAgeOverClaim,
  isDOBClaim,
  isKnownStaticClaim,
  maxReasonLength,
  maxShareFields,
  parseAgeOverThreshold,
} from "./claim-catalog";
import type {
  RequestedShareField,
  RequestedShareFields,
  ShareContractError,
} from "./types";

const docs = "https://kayle.id/docs/api/sessions#create";

const errorConfig = {
  INVALID_SHARE_FIELDS: {
    message: "Invalid share_fields payload.",
    hint: "share_fields must be an object map of claim keys.",
  },
  UNKNOWN_CLAIM_KEY: {
    message: "Unknown claim key.",
    hint: "Use a supported claim key from the share contract allowlist.",
  },
  INVALID_AGE_GATE_KEY: {
    message: "Invalid age gate claim key.",
    hint: "Use `age_over_<integer>` with a valid threshold, for example `age_over_18`.",
  },
  MULTIPLE_AGE_GATES_NOT_ALLOWED: {
    message: "Multiple age gate claims are not allowed.",
    hint: "Only one age_over_X claim can be provided per session.",
  },
  DOB_AND_AGE_GATE_CONFLICT: {
    message: "date_of_birth cannot be combined with age gate claims.",
    hint: "Use either dg1_date_of_birth or one age_over_X claim, but not both.",
  },
  REASON_REQUIRED: {
    message: "Each share field requires a reason.",
    hint: "Provide a non-empty reason for every requested claim.",
  },
  REASON_TOO_LONG: {
    message: "Reason is too long.",
    hint: `Reason must be ${maxReasonLength} characters or fewer.`,
  },
  TOO_MANY_SHARE_FIELDS: {
    message: "Too many share fields requested.",
    hint: `The maximum number of share fields is ${maxShareFields}.`,
  },
} as const;

function makeError(code: keyof typeof errorConfig): ShareContractError {
  return {
    code,
    message: errorConfig[code].message,
    hint: errorConfig[code].hint,
    docs,
    status: 400,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateRequestedField(
  claimKey: string,
  value: unknown
): RequestedShareField | ShareContractError {
  if (!isRecord(value)) {
    return makeError("INVALID_SHARE_FIELDS");
  }

  if (typeof value.required !== "boolean") {
    return makeError("INVALID_SHARE_FIELDS");
  }

  if (typeof value.reason !== "string") {
    return makeError("REASON_REQUIRED");
  }

  const reason = value.reason.trim();
  if (reason.length === 0) {
    return makeError("REASON_REQUIRED");
  }

  if (reason.length > maxReasonLength) {
    return makeError("REASON_TOO_LONG");
  }

  if (isAgeOverClaim(claimKey) && !parseAgeOverThreshold(claimKey)) {
    return makeError("INVALID_AGE_GATE_KEY");
  }

  if (!(isAgeOverClaim(claimKey) || isKnownStaticClaim(claimKey))) {
    return makeError("UNKNOWN_CLAIM_KEY");
  }

  return {
    required: value.required,
    reason: reason.replace(/\s+/g, " "),
  };
}

export function validateShareFields(
  value: unknown
):
  | { ok: true; data: RequestedShareFields }
  | { ok: false; error: ShareContractError } {
  if (!isRecord(value)) {
    return { ok: false, error: makeError("INVALID_SHARE_FIELDS") };
  }

  const entries = Object.entries(value);
  if (entries.length > maxShareFields) {
    return { ok: false, error: makeError("TOO_MANY_SHARE_FIELDS") };
  }

  let ageGateCount = 0;
  let hasDOB = false;
  const validated: RequestedShareFields = {};

  for (const [claimKey, rawField] of entries) {
    const field = validateRequestedField(claimKey, rawField);
    if ("code" in field) {
      return { ok: false, error: field };
    }

    if (isAgeOverClaim(claimKey)) {
      ageGateCount += 1;
      if (ageGateCount > 1) {
        return {
          ok: false,
          error: makeError("MULTIPLE_AGE_GATES_NOT_ALLOWED"),
        };
      }
    }

    if (isDOBClaim(claimKey)) {
      hasDOB = true;
    }

    validated[claimKey] = field;
  }

  if (hasDOB && ageGateCount > 0) {
    return { ok: false, error: makeError("DOB_AND_AGE_GATE_CONFLICT") };
  }

  return { ok: true, data: validated };
}
