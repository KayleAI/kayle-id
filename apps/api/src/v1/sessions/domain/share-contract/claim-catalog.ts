const AGE_OVER_PREFIX = "age_over_";
const DIGITS_ONLY_REGEX = /^\d+$/;

const STATIC_CLAIMS = [
  "dg1_document_type",
  "dg1_issuing_country",
  "dg1_surname",
  "dg1_given_names",
  "dg1_document_number",
  "dg1_nationality",
  "dg1_date_of_birth",
  "dg1_sex",
  "dg1_expiry_date",
  "dg1_optional_data",
  "dg2_face_image",
  "kayle_document_id",
  "kayle_human_id",
] as const;

const staticClaimSet = new Set<string>(STATIC_CLAIMS);

export const maxShareFields = 32;
export const maxReasonLength = 200;
export const minAgeThreshold = 1;
export const maxAgeThreshold = 130;

export const staticClaims = [...STATIC_CLAIMS];

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

  const threshold = Number(thresholdText);
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
  return claimKey === "dg1_date_of_birth";
}
