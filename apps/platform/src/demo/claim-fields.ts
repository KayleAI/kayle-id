import {
  defaultReasonForClaim,
  maxAgeThreshold,
  minAgeThreshold,
  parseAgeOverThreshold,
  staticClaims,
} from "@kayle-id/config/share-claims";
import type {
  DemoFieldMode,
  DemoRequestedShareFields,
  DemoSessionShareFields,
} from "./types";

export type DemoClaimSection = {
  claims: string[];
  description: string;
  title: string;
};

export const lockedDemoClaimKeys = [
  "kayle_document_id",
  "kayle_human_id",
] as const;

export const demoClaimSections: DemoClaimSection[] = [
  {
    title: "Identity",
    description:
      "Core holder details such as name, date of birth, nationality code, and sex marker.",
    claims: [
      "family_name",
      "given_names",
      "date_of_birth",
      "nationality_code",
      "sex_marker",
    ],
  },
  {
    title: "Document",
    description:
      "Passport metadata like issuing country code, document number, expiry date, and chip portrait.",
    claims: [
      "document_type_code",
      "issuing_country_code",
      "document_number",
      "document_expiry_date",
      "mrz_optional_data",
      "document_photo",
    ],
  },
  {
    title: "Security",
    description:
      "Kayle adds a document identifier to every session and reserves a human identifier for future anti-fraud checks.",
    claims: ["kayle_document_id", "kayle_human_id"],
  },
];

const claimDescriptions: Record<string, string> = {
  document_type_code: "Document type code from the MRZ, usually passport `P`.",
  issuing_country_code:
    "Three-letter issuing state code, for example `GBR` or `USA`.",
  family_name: "Family name from the document, for example `DOE`.",
  given_names: "All given names from the document, for example `JANE MARIE`.",
  document_number: "Passport or document number, for example `123456789`.",
  nationality_code:
    "Three-letter nationality code, for example `GBR` or `USA`.",
  date_of_birth: "Full birth date from the document, for example `1992-04-16`.",
  sex_marker: "Sex marker from the document, typically `F`, `M`, or `X`.",
  document_expiry_date: "Document expiry date, for example `2032-04-16`.",
  mrz_optional_data:
    "Additional MRZ data when present, such as a personal number.",
  document_photo:
    "Portrait securely read from the chip for document-bound face matching.",
  kayle_document_id:
    "Receiver-scoped identifier for this exact document, not a global passport number.",
  kayle_human_id:
    "Reserved placeholder for a future receiver-scoped human identifier. Currently null.",
};

export function isLockedDemoClaim(claimKey: string): boolean {
  return lockedDemoClaimKeys.includes(
    claimKey as (typeof lockedDemoClaimKeys)[number]
  );
}

export const initialFieldModes = Object.fromEntries(
  staticClaims.map((claimKey) => [
    claimKey,
    isLockedDemoClaim(claimKey) ? "required" : "off",
  ])
) as Record<(typeof staticClaims)[number], DemoFieldMode>;

function normalizeMode(mode: DemoFieldMode): boolean {
  return mode === "required";
}

function buildAgeGateField({
  ageThresholdText,
  fieldModes,
}: {
  ageThresholdText: string;
  fieldModes: Record<string, DemoFieldMode>;
}):
  | { ok: true; field: [string, DemoRequestedShareFields[string]] | null }
  | { ok: false; message: string } {
  const normalizedAgeThresholdText = ageThresholdText.trim();

  if (!normalizedAgeThresholdText) {
    return {
      ok: true,
      field: null,
    };
  }

  const ageThreshold = Number.parseInt(normalizedAgeThresholdText, 10);
  if (
    !Number.isInteger(ageThreshold) ||
    ageThreshold < minAgeThreshold ||
    ageThreshold > maxAgeThreshold
  ) {
    return {
      ok: false,
      message: `Age threshold must be between ${minAgeThreshold} and ${maxAgeThreshold}.`,
    };
  }

  if ((fieldModes.date_of_birth ?? "off") !== "off") {
    return {
      ok: false,
      message:
        "Date of Birth and an age gate cannot both be requested in the same demo session.",
    };
  }

  const ageClaim = `age_over_${ageThreshold}`;
  return {
    ok: true,
    field: [
      ageClaim,
      {
        required: true,
        reason: defaultReasonForClaim(ageClaim),
      },
    ],
  };
}

export function getModeLabel(mode: DemoFieldMode): string {
  switch (mode) {
    case "required":
      return "Required";
    case "optional":
      return "Optional";
    case "off":
      return "Off";
    default:
      return "Off";
  }
}

export function buildRequestedShareFields({
  ageThresholdText,
  fieldModes,
}: {
  ageThresholdText: string;
  fieldModes: Record<string, DemoFieldMode>;
}):
  | { ok: true; shareFields: DemoRequestedShareFields | undefined }
  | { ok: false; message: string } {
  const shareFields: DemoRequestedShareFields = {};

  for (const claimKey of staticClaims) {
    const mode = isLockedDemoClaim(claimKey)
      ? "required"
      : (fieldModes[claimKey] ?? "off");
    if (mode === "off") {
      continue;
    }

    shareFields[claimKey] = {
      required: normalizeMode(mode),
      reason: defaultReasonForClaim(claimKey),
    };
  }

  const ageGateField = buildAgeGateField({
    ageThresholdText,
    fieldModes,
  });

  if (!ageGateField.ok) {
    return ageGateField;
  }

  if (ageGateField.field) {
    const [claimKey, field] = ageGateField.field;
    shareFields[claimKey] = field;
  }

  return {
    ok: true,
    shareFields:
      Object.keys(shareFields).length > 0
        ? sortShareFields(shareFields)
        : undefined,
  };
}

export function describeEffectiveField(
  _claimKey: string,
  field: DemoSessionShareFields[string]
): string {
  const source = field.source === "default" ? "Default" : "Requested";
  const requirement = field.required ? "Required" : "Optional";
  return `${source} · ${requirement}`;
}

export function getClaimDescription(claimKey: string): string {
  const ageThreshold = parseAgeOverThreshold(claimKey);
  if (ageThreshold) {
    return `Yes-or-no proof that the holder is at least ${ageThreshold}, without sharing the full date of birth.`;
  }

  return claimDescriptions[claimKey] ?? "Verified field from the document.";
}

function sortShareFields(
  fields: DemoRequestedShareFields
): DemoRequestedShareFields {
  return Object.fromEntries(
    Object.entries(fields).sort(([left], [right]) => left.localeCompare(right))
  );
}
