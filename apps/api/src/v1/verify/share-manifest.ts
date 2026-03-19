import type {
  VerifyShareReady,
  VerifyShareRequest,
} from "@kayle-id/capnp/verify-codec";
import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import {
  isAgeOverClaim,
  parseAgeOverThreshold,
} from "@/v1/sessions/domain/share-contract/claim-catalog";
import { createKayleDocumentId } from "@/v1/sessions/domain/share-contract/kayle-document-id";
import { normalizeShareFields } from "@/v1/sessions/domain/share-contract/normalize-share-fields";
import type { ShareFields } from "@/v1/sessions/domain/share-contract/types";
import { extractDg2FaceImage } from "./dg2-face-image";
import { readTlv } from "./tlv";

const DG1_ROOT_TAG = 0x61;
const MRZ_DATA_TAG = 0x5f_1f;
const MRZ_LINE_LENGTH = 44;
const MIN_BIRTH_YEAR_OFFSET = 130;
const MAX_EXPIRY_PAST_OFFSET = 50;
const MAX_EXPIRY_FUTURE_OFFSET = 50;
const SIX_DIGIT_DATE_REGEX = /^\d{6}$/;

type ShareSelectionValidationCode =
  | "INVALID_SESSION_ID"
  | "SHARE_SELECTION_REQUIRED"
  | "SHARE_SELECTION_INVALID_FIELD"
  | "SHARE_SELECTION_MISSING_REQUIRED";

type ShareClaimImage = {
  dataBase64: string;
  format: "jpeg" | "jpeg2000";
  height: number;
  width: number;
};

export type VerifyShareClaimValue = boolean | string | ShareClaimImage | null;

export type VerifyShareManifest = {
  contractVersion: number;
  claims: Record<string, VerifyShareClaimValue>;
  selectedFieldKeys: string[];
  sessionId: string;
};

type Dg1Claims = {
  birthDateIso: string;
  documentNumber: string;
  documentType: string;
  expiryDateIso: string;
  givenNames: string;
  issuingCountry: string;
  nationality: string;
  optionalData: string;
  sex: string;
  surname: string;
};

const defaultNormalizedShareFields = (() => {
  const normalized = normalizeShareFields(undefined);

  if (!normalized.ok) {
    throw new Error("Failed to initialize default share fields.");
  }

  return normalized.shareFields;
})();

function resolveErrorMessage(code: ShareSelectionValidationCode): string {
  return ERROR_MESSAGES[code].description;
}

function normalizeMrzText(raw: string): string {
  const filtered = raw
    .toUpperCase()
    .replaceAll(" ", "")
    .replaceAll("\r", "")
    .split("")
    .filter((character) => {
      if (character === "\n" || character === "<") {
        return true;
      }

      return (
        (character >= "A" && character <= "Z") ||
        (character >= "0" && character <= "9")
      );
    })
    .join("");

  const flattened = filtered.replaceAll("\n", "");

  if (flattened.length !== MRZ_LINE_LENGTH * 2 || !flattened.startsWith("P")) {
    throw new Error("dg1_mrz_invalid");
  }

  return `${flattened.slice(0, MRZ_LINE_LENGTH)}\n${flattened.slice(
    MRZ_LINE_LENGTH
  )}`;
}

function extractMrzTextFromDg1(dg1: Uint8Array): string {
  try {
    return normalizeMrzText(new TextDecoder().decode(dg1));
  } catch {
    // Fall through to TLV parsing when DG1 is encoded as a data group.
  }

  let offset = 0;

  while (offset < dg1.length) {
    const entry = readTlv(dg1, offset);

    if (entry.tag === MRZ_DATA_TAG) {
      return normalizeMrzText(new TextDecoder().decode(entry.value));
    }

    if (entry.tag === DG1_ROOT_TAG) {
      let innerOffset = 0;

      while (innerOffset < entry.value.length) {
        const nestedEntry = readTlv(entry.value, innerOffset);
        if (nestedEntry.tag === MRZ_DATA_TAG) {
          return normalizeMrzText(new TextDecoder().decode(nestedEntry.value));
        }
        innerOffset = nestedEntry.nextOffset;
      }
    }

    offset = entry.nextOffset;
  }

  throw new Error("dg1_mrz_not_found");
}

function sliceText(value: string, start: number, end: number): string {
  return value.slice(start, end);
}

function mrzChar(value: string, index: number): string {
  return value[index] ?? "";
}

function unfill(value: string): string {
  return value.replaceAll("<", "").trim();
}

function parseNames(value: string): {
  givenNames: string;
  surname: string;
} {
  const raw = value.replaceAll("<<", "|");
  const pieces = raw.split("|");
  const surname = unfill((pieces[0] ?? "").replaceAll("<", " ")).trim();
  const givenNames = unfill(
    pieces.slice(1).join(" ").replaceAll("<", " ")
  ).trim();

  return {
    givenNames,
    surname,
  };
}

function expandMrzDateWithinRange({
  maxYear,
  minYear,
  value,
}: {
  maxYear: number;
  minYear: number;
  value: string;
}): string {
  if (!SIX_DIGIT_DATE_REGEX.test(value)) {
    throw new Error("mrz_date_invalid");
  }

  const yearSuffix = Number.parseInt(value.slice(0, 2), 10);
  const month = Number.parseInt(value.slice(2, 4), 10);
  const day = Number.parseInt(value.slice(4, 6), 10);
  const baseCentury = Math.floor(maxYear / 100) * 100;
  const candidateYears = new Set<number>();

  for (const offset of [-200, -100, 0, 100]) {
    candidateYears.add(baseCentury + offset + yearSuffix);
  }

  const validYears = [...candidateYears]
    .filter(
      (candidateYear) => candidateYear >= minYear && candidateYear <= maxYear
    )
    .sort((left, right) => right - left);
  const resolvedYear = validYears[0];

  if (!resolvedYear || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("mrz_date_invalid");
  }

  return `${resolvedYear.toString().padStart(4, "0")}-${value.slice(
    2,
    4
  )}-${value.slice(4, 6)}`;
}

function parseTd3MrzClaims(dg1: Uint8Array, now: Date): Dg1Claims {
  const [lineOne, lineTwo] = extractMrzTextFromDg1(dg1).split("\n");

  if (
    !(
      lineOne &&
      lineTwo &&
      lineOne.length === MRZ_LINE_LENGTH &&
      lineTwo.length === MRZ_LINE_LENGTH &&
      lineOne.startsWith("P")
    )
  ) {
    throw new Error("dg1_td3_invalid");
  }

  const { givenNames, surname } = parseNames(sliceText(lineOne, 5, 44));
  const birthYearMax = now.getUTCFullYear();
  const expiryYear = now.getUTCFullYear();
  const sex = mrzChar(lineTwo, 20);

  return {
    birthDateIso: expandMrzDateWithinRange({
      value: sliceText(lineTwo, 13, 19),
      minYear: birthYearMax - MIN_BIRTH_YEAR_OFFSET,
      maxYear: birthYearMax,
    }),
    documentNumber: unfill(sliceText(lineTwo, 0, 9)),
    documentType: unfill(sliceText(lineOne, 0, 2)),
    expiryDateIso: expandMrzDateWithinRange({
      value: sliceText(lineTwo, 21, 27),
      minYear: expiryYear - MAX_EXPIRY_PAST_OFFSET,
      maxYear: expiryYear + MAX_EXPIRY_FUTURE_OFFSET,
    }),
    givenNames,
    issuingCountry: unfill(sliceText(lineOne, 2, 5)),
    nationality: unfill(sliceText(lineTwo, 10, 13)),
    optionalData: unfill(sliceText(lineTwo, 28, 42)),
    sex: sex === "<" ? "X" : sex,
    surname,
  };
}

function ageFromDateOfBirth(dateOfBirthIso: string, now: Date): number {
  const [yearText, monthText, dayText] = dateOfBirthIso.split("-");

  if (!(yearText && monthText && dayText)) {
    throw new Error("date_of_birth_invalid");
  }

  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  let age = now.getUTCFullYear() - year;
  const monthDelta = now.getUTCMonth() + 1 - month;
  const dayDelta = now.getUTCDate() - day;

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age;
}

function encodeBase64(bytes: Uint8Array): string {
  let output = "";
  const chunkSize = 0x80_00;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    output += String.fromCharCode(...chunk);
  }

  return btoa(output);
}

async function buildShareClaimValue({
  claimKey,
  dg1Claims,
  dg2,
  now,
  organizationId,
}: {
  claimKey: string;
  dg1Claims: Dg1Claims;
  dg2: Uint8Array;
  now: Date;
  organizationId: string;
}): Promise<VerifyShareClaimValue> {
  switch (claimKey) {
    case "document_type_code":
      return dg1Claims.documentType;
    case "issuing_country_code":
      return dg1Claims.issuingCountry;
    case "family_name":
      return dg1Claims.surname;
    case "given_names":
      return dg1Claims.givenNames;
    case "document_number":
      return dg1Claims.documentNumber;
    case "nationality_code":
      return dg1Claims.nationality;
    case "date_of_birth":
      return dg1Claims.birthDateIso;
    case "sex_marker":
      return dg1Claims.sex;
    case "document_expiry_date":
      return dg1Claims.expiryDateIso;
    case "mrz_optional_data":
      return dg1Claims.optionalData;
    case "document_photo": {
      const faceImage = extractDg2FaceImage(dg2);

      return {
        dataBase64: encodeBase64(faceImage.imageData),
        format: faceImage.imageFormat,
        height: faceImage.imageHeight,
        width: faceImage.imageWidth,
      };
    }
    case "kayle_document_id":
      return await createKayleDocumentId({
        organizationId,
        countryCode: dg1Claims.issuingCountry,
        documentNumber: dg1Claims.documentNumber,
        documentType: dg1Claims.documentType,
      });
    case "kayle_human_id":
      return null;
    default: {
      if (!isAgeOverClaim(claimKey)) {
        throw new Error(`unsupported_share_claim:${claimKey}`);
      }

      const threshold = parseAgeOverThreshold(claimKey);

      if (!threshold) {
        throw new Error(`invalid_age_over_claim:${claimKey}`);
      }

      return ageFromDateOfBirth(dg1Claims.birthDateIso, now) >= threshold;
    }
  }
}

function normalizeSelectedFieldKeys({
  availableFields,
  selectedFieldKeysInput,
}: {
  availableFields: VerifyShareRequest["fields"];
  selectedFieldKeysInput: string[] | undefined;
}):
  | {
      ok: true;
      selectedFieldKeys: string[];
    }
  | {
      code: ShareSelectionValidationCode;
      message: string;
      ok: false;
    } {
  if (
    !(selectedFieldKeysInput && Array.isArray(selectedFieldKeysInput)) ||
    selectedFieldKeysInput.length === 0
  ) {
    return {
      ok: false,
      code: "SHARE_SELECTION_REQUIRED",
      message: resolveErrorMessage("SHARE_SELECTION_REQUIRED"),
    };
  }

  const selectedFieldKeySet = new Set(
    selectedFieldKeysInput
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );

  if (selectedFieldKeySet.size === 0) {
    return {
      ok: false,
      code: "SHARE_SELECTION_REQUIRED",
      message: resolveErrorMessage("SHARE_SELECTION_REQUIRED"),
    };
  }

  const availableFieldKeySet = new Set(
    availableFields.map((field) => field.key)
  );

  for (const key of selectedFieldKeySet) {
    if (!availableFieldKeySet.has(key)) {
      return {
        ok: false,
        code: "SHARE_SELECTION_INVALID_FIELD",
        message: resolveErrorMessage("SHARE_SELECTION_INVALID_FIELD"),
      };
    }
  }

  const missingRequiredField = availableFields.some(
    (field) => field.required && !selectedFieldKeySet.has(field.key)
  );

  if (missingRequiredField) {
    return {
      ok: false,
      code: "SHARE_SELECTION_MISSING_REQUIRED",
      message: resolveErrorMessage("SHARE_SELECTION_MISSING_REQUIRED"),
    };
  }

  return {
    ok: true,
    selectedFieldKeys: availableFields
      .filter((field) => selectedFieldKeySet.has(field.key))
      .map((field) => field.key),
  };
}

function resolveShareFields(shareFieldsInput: unknown): ShareFields {
  const normalized = normalizeShareFields(shareFieldsInput);

  if (!normalized.ok) {
    return defaultNormalizedShareFields;
  }

  return normalized.shareFields;
}

export function createShareRequestPayload({
  contractVersion,
  sessionId,
  shareFieldsInput,
}: {
  contractVersion: number;
  sessionId: string;
  shareFieldsInput: unknown;
}): VerifyShareRequest {
  const shareFields = resolveShareFields(shareFieldsInput);

  return {
    contractVersion,
    sessionId,
    fields: Object.entries(shareFields).map(([key, field]) => ({
      key,
      reason: field.reason,
      required: field.required,
    })),
  };
}

export async function validateAndBuildShareManifest({
  contractVersion,
  dg1,
  dg2,
  now = new Date(),
  organizationId,
  selectedFieldKeysInput,
  sessionId,
  submittedSessionId,
  shareFieldsInput,
}: {
  contractVersion: number;
  dg1: Uint8Array;
  dg2: Uint8Array;
  now?: Date;
  organizationId: string;
  selectedFieldKeysInput: string[] | undefined;
  sessionId: string;
  submittedSessionId: string | undefined;
  shareFieldsInput: unknown;
}): Promise<
  | {
      manifest: VerifyShareManifest;
      ok: true;
      shareReady: VerifyShareReady;
    }
  | {
      code: ShareSelectionValidationCode;
      message: string;
      ok: false;
    }
> {
  if (submittedSessionId?.trim() !== sessionId) {
    return {
      ok: false,
      code: "INVALID_SESSION_ID",
      message: resolveErrorMessage("INVALID_SESSION_ID"),
    };
  }

  const shareRequest = createShareRequestPayload({
    contractVersion,
    sessionId,
    shareFieldsInput,
  });
  const selection = normalizeSelectedFieldKeys({
    availableFields: shareRequest.fields,
    selectedFieldKeysInput,
  });

  if (!selection.ok) {
    return selection;
  }

  const dg1Claims = parseTd3MrzClaims(dg1, now);
  const claimEntries = await Promise.all(
    selection.selectedFieldKeys.map(
      async (claimKey) =>
        [
          claimKey,
          await buildShareClaimValue({
            claimKey,
            dg1Claims,
            dg2,
            now,
            organizationId,
          }),
        ] as const
    )
  );
  const claims = Object.fromEntries(claimEntries);

  return {
    ok: true,
    shareReady: {
      sessionId,
      selectedFieldKeys: selection.selectedFieldKeys,
    },
    manifest: {
      contractVersion,
      claims,
      selectedFieldKeys: selection.selectedFieldKeys,
      sessionId,
    },
  };
}
