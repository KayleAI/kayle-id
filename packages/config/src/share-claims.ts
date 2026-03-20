const AGE_OVER_PREFIX = "age_over_";
const DIGITS_ONLY_REGEX = /^\d+$/;

export const STATIC_CLAIMS = [
  "document_type_code",
  "issuing_country_code",
  "family_name",
  "given_names",
  "document_number",
  "nationality_code",
  "date_of_birth",
  "sex_marker",
  "document_expiry_date",
  "mrz_optional_data",
  "document_photo",
  "kayle_document_id",
  "kayle_human_id",
] as const;

const staticClaimSet = new Set<string>(STATIC_CLAIMS);

export const maxShareFields = 32;
export const maxReasonLength = 200;
export const minAgeThreshold = 12;
export const maxAgeThreshold = 130;
export const staticClaims = [...STATIC_CLAIMS];

export const claimLabels: Record<string, string> = {
  document_type_code: "Document Type Code",
  issuing_country_code: "Issuing Country Code",
  family_name: "Family Name",
  given_names: "Given Names",
  document_number: "Document Number",
  nationality_code: "Nationality Code",
  date_of_birth: "Date of Birth",
  sex_marker: "Sex Marker",
  document_expiry_date: "Document Expiry Date",
  mrz_optional_data: "MRZ Optional Data",
  document_photo: "Document Photo",
  kayle_document_id: "Kayle Document ID",
  kayle_human_id: "Kayle Human ID",
};

export function isKnownStaticClaim(claimKey: string): boolean {
  return staticClaimSet.has(claimKey);
}

export function parseAgeOverThreshold(claimKey: string): number | null {
  if (!claimKey.startsWith(AGE_OVER_PREFIX)) {
    return null;
  }

  const thresholdText = claimKey.slice(AGE_OVER_PREFIX.length);
  if (!DIGITS_ONLY_REGEX.test(thresholdText)) {
    return null;
  }

  const threshold = Number.parseInt(thresholdText, 10);
  if (
    !Number.isInteger(threshold) ||
    threshold < minAgeThreshold ||
    threshold > maxAgeThreshold
  ) {
    return null;
  }

  return threshold;
}

export function isAgeOverClaim(claimKey: string): boolean {
  return claimKey.startsWith(AGE_OVER_PREFIX);
}

export function isDOBClaim(claimKey: string): boolean {
  return claimKey === "date_of_birth";
}

export function getClaimLabel(claimKey: string): string {
  const ageThreshold = parseAgeOverThreshold(claimKey);
  if (ageThreshold) {
    return `Age Over ${ageThreshold}`;
  }

  return claimLabels[claimKey] ?? claimKey;
}

export function defaultReasonForClaim(claimKey: string): string {
  return `Sharing "${getClaimLabel(claimKey)}"`;
}
