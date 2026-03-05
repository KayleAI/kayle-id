import { staticClaims } from "./claim-catalog";
import { defaultReasonForClaim } from "./default-reasons";
import type {
  RequestedShareFields,
  ShareContractError,
  ShareField,
  ShareFields,
} from "./types";
import { validateShareFields } from "./validate-share-fields";

function toSortedShareFields(fields: ShareFields): ShareFields {
  return Object.fromEntries(
    Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))
  );
}

function makeDefaultEntry(claimKey: string, required: boolean): ShareField {
  return {
    required,
    reason: defaultReasonForClaim(claimKey),
    source: "default",
  };
}

function createDefaultShareFields(): ShareFields {
  const defaults: ShareFields = {};
  for (const claimKey of staticClaims) {
    defaults[claimKey] = makeDefaultEntry(
      claimKey,
      claimKey === "kayle_document_id"
    );
  }
  return toSortedShareFields(defaults);
}

function normalizeRequestedShareFields(
  requested: RequestedShareFields
): ShareFields {
  const normalized: ShareFields = {};

  for (const [claimKey, entry] of Object.entries(requested)) {
    normalized[claimKey] = {
      required: entry.required,
      reason: entry.reason,
      source: "rc",
    };
  }

  const docId = normalized.kayle_document_id;
  if (docId) {
    normalized.kayle_document_id = {
      ...docId,
      required: true,
    };
  } else {
    normalized.kayle_document_id = makeDefaultEntry("kayle_document_id", true);
  }

  return toSortedShareFields(normalized);
}

export function normalizeShareFields(
  value: unknown
):
  | { ok: true; shareFields: ShareFields }
  | { ok: false; error: ShareContractError } {
  if (value === undefined) {
    return { ok: true, shareFields: createDefaultShareFields() };
  }

  const validated = validateShareFields(value);
  if (!validated.ok) {
    return validated;
  }

  return {
    ok: true,
    shareFields: normalizeRequestedShareFields(validated.data),
  };
}
