const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DIGIT_REGEX = /^\d$/;
const MRZ_WEIGHTS = [7, 3, 1] as const;
const DATE_CLAIM_KEYS = new Set(["date_of_birth", "document_expiry_date"]);
const UPPERCASE_CLAIM_KEYS = new Set([
  "document_type_code",
  "issuing_country_code",
  "nationality_code",
  "sex_marker",
]);

export type DemoDocumentKind = "id-card" | "passport";

export type DemoDocumentPhoto = {
  dataUri: string;
  format: "jpeg" | "jpeg2000";
  height: number;
  width: number;
};

export type DemoDecryptedWebhook = {
  claims: Record<string, unknown>;
  contractVersion: number | null;
  selectedFieldKeys: string[];
  type: string | null;
  verificationSessionId: string | null;
};

export type DemoWebhookEventPreview = {
  contractVersion: number | null;
  description: string;
  eventType: string | null;
  failureCode: string | null;
  title: string;
  verificationAttemptId: string | null;
  verificationSessionId: string | null;
};

export type DemoDocumentPreview = {
  claims: Record<string, unknown>;
  contractVersion: number | null;
  dateOfBirth: string | null;
  documentExpiryDate: string | null;
  documentKind: DemoDocumentKind;
  documentNumber: string | null;
  documentPhoto: DemoDocumentPhoto | null;
  documentTypeCode: string | null;
  eventType: string | null;
  familyName: string | null;
  givenNames: string | null;
  issuingCountryCode: string | null;
  kayleDocumentId: string | null;
  kayleHumanId: string | null;
  machineReadableZone: readonly [string, string] | null;
  mrzOptionalData: string | null;
  nationalityCode: string | null;
  selectedFieldKeys: string[];
  sexMarker: string | null;
  title: string;
  verificationSessionId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCode(value: string | null): string | null {
  return value ? value.toUpperCase() : null;
}

function normalizeText(value: string | null): string | null {
  return value ? value.replace(/\s+/g, " ").trim() : null;
}

function normalizeMrzText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s-]+/g, "<")
    .replace(/'/g, "")
    .replace(/[^A-Z0-9<]/g, "<");
}

function padMrzField(value: string, length: number): string {
  return value.padEnd(length, "<").slice(0, length);
}

function getMrzCharacterValue(character: string): number {
  if (character === "<") {
    return 0;
  }

  if (DIGIT_REGEX.test(character)) {
    return Number.parseInt(character, 10);
  }

  return character.charCodeAt(0) - 55;
}

function calculateMrzCheckDigit(value: string): string {
  let total = 0;

  for (const [index, character] of [...value].entries()) {
    total += getMrzCharacterValue(character) * MRZ_WEIGHTS[index % 3];
  }

  return String(total % 10);
}

function createMrzPlaceholder(length: number): string {
  return "<".repeat(length);
}

function formatIsoDateForMrz(value: string | null | undefined): string {
  if (!(value && ISO_DATE_REGEX.test(value))) {
    return createMrzPlaceholder(6);
  }

  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))
  );

  if (
    date.getUTCFullYear() !== Number(yearText) ||
    date.getUTCMonth() !== Number(monthText) - 1 ||
    date.getUTCDate() !== Number(dayText)
  ) {
    return createMrzPlaceholder(6);
  }

  return `${yearText.slice(2)}${monthText}${dayText}`;
}

function normalizeSexMarkerForMrz(value: string): string {
  if (value === "M" || value === "F") {
    return value;
  }

  return "<";
}

export function buildPassportMachineReadableZone({
  dateOfBirth,
  documentExpiryDate,
  documentNumber,
  documentTypeCode,
  familyName,
  givenNames,
  issuingCountryCode,
  mrzOptionalData,
  nationalityCode,
  sexMarker,
}: {
  dateOfBirth: string | null;
  documentExpiryDate: string | null;
  documentNumber: string | null;
  documentTypeCode: string | null;
  familyName: string | null;
  givenNames: string | null;
  issuingCountryCode: string | null;
  mrzOptionalData: string | null;
  nationalityCode: string | null;
  sexMarker: string | null;
}): readonly [string, string] {
  const birthDate = formatIsoDateForMrz(dateOfBirth);
  const expiryDate = formatIsoDateForMrz(documentExpiryDate);
  const surname = familyName ? normalizeMrzText(familyName) : "";
  const givenNameBlock = givenNames ? normalizeMrzText(givenNames) : "";

  const documentCode = padMrzField(
    normalizeMrzText(documentTypeCode ?? "P"),
    2
  );
  const issuingState = padMrzField(
    normalizeMrzText(issuingCountryCode ?? ""),
    3
  );
  const nameField = padMrzField(
    `${surname || "<"}<<${givenNameBlock || "<"}`,
    39
  );
  const passportNumber = padMrzField(normalizeMrzText(documentNumber ?? ""), 9);
  const passportNumberCheckDigit = calculateMrzCheckDigit(passportNumber);
  const nationality = padMrzField(normalizeMrzText(nationalityCode ?? ""), 3);
  const birthDateCheckDigit = calculateMrzCheckDigit(birthDate);
  const normalizedSexMarker = normalizeSexMarkerForMrz(sexMarker ?? "<");
  const expiryDateCheckDigit = calculateMrzCheckDigit(expiryDate);
  const optionalData = padMrzField(normalizeMrzText(mrzOptionalData ?? ""), 14);
  const optionalDataCheckDigit = calculateMrzCheckDigit(optionalData);
  const compositeCheckDigit = calculateMrzCheckDigit(
    [
      passportNumber,
      passportNumberCheckDigit,
      birthDate,
      birthDateCheckDigit,
      expiryDate,
      expiryDateCheckDigit,
      optionalData,
      optionalDataCheckDigit,
    ].join("")
  );

  return [
    `${documentCode}${issuingState}${nameField}`,
    `${passportNumber}${passportNumberCheckDigit}${nationality}${birthDate}${birthDateCheckDigit}${normalizedSexMarker}${expiryDate}${expiryDateCheckDigit}${optionalData}${optionalDataCheckDigit}${compositeCheckDigit}`,
  ] as const;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedValues: string[] = [];

  for (const item of value) {
    const normalizedItem = toNonEmptyString(item);
    if (normalizedItem) {
      normalizedValues.push(normalizedItem);
    }
  }

  return normalizedValues;
}

function parseDemoWebhookPayload(payload: string | null): {
  data: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  type: string | null;
} | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const data = isRecord(parsed.data) ? parsed.data : null;
    const metadata = isRecord(parsed.metadata) ? parsed.metadata : null;

    if (!data) {
      return null;
    }

    return {
      data,
      metadata,
      type: toNonEmptyString(parsed.type),
    };
  } catch {
    return null;
  }
}

export function parseDemoDecryptedWebhook(
  payload: string | null
): DemoDecryptedWebhook | null {
  const parsed = parseDemoWebhookPayload(payload);
  const claims =
    parsed && isRecord(parsed.data.claims) ? parsed.data.claims : null;

  if (!claims) {
    return null;
  }

  return {
    claims,
    contractVersion:
      typeof parsed.metadata?.contract_version === "number"
        ? parsed.metadata.contract_version
        : null,
    selectedFieldKeys: toStringArray(parsed.data.selected_field_keys),
    type: parsed.type,
    verificationSessionId: toNonEmptyString(
      parsed.metadata?.verification_session_id
    ),
  };
}

function formatWebhookEventLabel(eventType: string | null): string {
  switch (eventType) {
    case "verification.attempt.failed":
      return "Attempt Failed";
    case "verification.attempt.succeeded":
      return "Attempt Succeeded";
    case "verification.session.cancelled":
      return "Session Cancelled";
    case "verification.session.expired":
      return "Session Expired";
    default:
      return "Webhook Event";
  }
}

function formatFailureCodeLabel(failureCode: string | null): string | null {
  if (!failureCode) {
    return null;
  }

  return failureCode
    .split("_")
    .map((segment) =>
      segment.length > 0
        ? `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`
        : segment
    )
    .join(" ");
}

function buildWebhookEventDescription({
  eventType,
  failureCode,
}: {
  eventType: string | null;
  failureCode: string | null;
}): string {
  const failureCodeLabel = formatFailureCodeLabel(failureCode);

  switch (eventType) {
    case "verification.attempt.failed":
      return failureCodeLabel
        ? `A verification attempt failed with ${failureCodeLabel}.`
        : "A verification attempt failed.";
    case "verification.attempt.succeeded":
      return "The verified document payload was received successfully.";
    case "verification.session.cancelled":
      return "The verification session was cancelled before completion.";
    case "verification.session.expired":
      return "The verification session expired before completion.";
    default:
      return "The latest webhook payload was received successfully.";
  }
}

export function buildDemoWebhookEventPreview(
  payload: string | null
): DemoWebhookEventPreview | null {
  const parsed = parseDemoWebhookPayload(payload);

  if (!parsed) {
    return null;
  }

  const failureCode = toNonEmptyString(parsed.data.failure_code);

  return {
    contractVersion:
      typeof parsed.metadata?.contract_version === "number"
        ? parsed.metadata.contract_version
        : null,
    description: buildWebhookEventDescription({
      eventType: parsed.type,
      failureCode,
    }),
    eventType: parsed.type,
    failureCode,
    title: formatWebhookEventLabel(parsed.type),
    verificationAttemptId: toNonEmptyString(
      parsed.metadata?.verification_attempt_id
    ),
    verificationSessionId: toNonEmptyString(
      parsed.metadata?.verification_session_id
    ),
  };
}

export function inferDemoDocumentKind(
  documentTypeCode: string | null | undefined
): DemoDocumentKind {
  const normalizedCode = normalizeCode(documentTypeCode?.trim() ?? null);

  if (!normalizedCode || normalizedCode.startsWith("P")) {
    return "passport";
  }

  if (
    normalizedCode.startsWith("I") ||
    normalizedCode.startsWith("A") ||
    normalizedCode.startsWith("C")
  ) {
    return "id-card";
  }

  return "passport";
}

export function formatDemoDocumentDate(
  value: string | null | undefined
): string | null {
  if (!(value && ISO_DATE_REGEX.test(value))) {
    return value ?? null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  })
    .format(date)
    .toUpperCase();
}

export function buildDemoDocumentPhoto(
  value: unknown
): DemoDocumentPhoto | null {
  if (!isRecord(value)) {
    return null;
  }

  const dataBase64 = toNonEmptyString(value.dataBase64);
  const format = value.format;
  const height = toFiniteNumber(value.height);
  const width = toFiniteNumber(value.width);

  if (
    !(
      dataBase64 &&
      (format === "jpeg" || format === "jpeg2000") &&
      height &&
      width
    )
  ) {
    return null;
  }

  const mimeType = format === "jpeg" ? "image/jpeg" : "image/jp2";

  return {
    dataUri: `data:${mimeType};base64,${dataBase64}`,
    format,
    height,
    width,
  };
}

function formatStringClaimValue(claimKey: string, value: string): string {
  if (DATE_CLAIM_KEYS.has(claimKey)) {
    return formatDemoDocumentDate(value) ?? value;
  }

  if (UPPERCASE_CLAIM_KEYS.has(claimKey)) {
    return value.toUpperCase();
  }

  return value;
}

export function formatDemoClaimValue(claimKey: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "Not shared";
  }

  if (claimKey === "document_photo") {
    const photo = buildDemoDocumentPhoto(value);
    if (!photo) {
      return "Chip portrait attached";
    }

    return `Chip portrait · ${photo.format.toUpperCase()} · ${photo.width}×${photo.height}`;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    return formatStringClaimValue(claimKey, value);
  }

  return JSON.stringify(value);
}

export function buildDemoDocumentPreview(
  payload: string | null
): DemoDocumentPreview | null {
  const parsed = parseDemoDecryptedWebhook(payload);
  if (!(parsed && Object.keys(parsed.claims).length > 0)) {
    return null;
  }

  const documentTypeCode = normalizeCode(
    toNonEmptyString(parsed.claims.document_type_code)
  );
  const documentKind = inferDemoDocumentKind(documentTypeCode);
  const dateOfBirth = normalizeText(
    toNonEmptyString(parsed.claims.date_of_birth)
  );
  const documentExpiryDate = normalizeText(
    toNonEmptyString(parsed.claims.document_expiry_date)
  );
  const documentNumber = normalizeText(
    toNonEmptyString(parsed.claims.document_number)
  );
  const documentPhoto = buildDemoDocumentPhoto(parsed.claims.document_photo);
  const familyName = normalizeText(toNonEmptyString(parsed.claims.family_name));
  const givenNames = normalizeText(toNonEmptyString(parsed.claims.given_names));
  const issuingCountryCode = normalizeCode(
    toNonEmptyString(parsed.claims.issuing_country_code)
  );
  const mrzOptionalData = normalizeText(
    toNonEmptyString(parsed.claims.mrz_optional_data)
  );
  const nationalityCode = normalizeCode(
    toNonEmptyString(parsed.claims.nationality_code)
  );
  const sexMarker = normalizeCode(toNonEmptyString(parsed.claims.sex_marker));

  return {
    claims: parsed.claims,
    contractVersion: parsed.contractVersion,
    dateOfBirth,
    documentExpiryDate,
    documentKind,
    documentNumber,
    documentPhoto,
    documentTypeCode,
    eventType: parsed.type,
    familyName,
    givenNames,
    issuingCountryCode,
    kayleDocumentId: normalizeText(
      toNonEmptyString(parsed.claims.kayle_document_id)
    ),
    kayleHumanId: normalizeText(toNonEmptyString(parsed.claims.kayle_human_id)),
    machineReadableZone:
      documentKind === "passport"
        ? buildPassportMachineReadableZone({
            dateOfBirth,
            documentExpiryDate,
            documentNumber,
            documentTypeCode,
            familyName,
            givenNames,
            issuingCountryCode,
            mrzOptionalData,
            nationalityCode,
            sexMarker,
          })
        : null,
    mrzOptionalData,
    nationalityCode,
    selectedFieldKeys: parsed.selectedFieldKeys,
    sexMarker,
    title: documentKind === "id-card" ? "Identity Card" : "Passport",
    verificationSessionId: parsed.verificationSessionId,
  };
}
