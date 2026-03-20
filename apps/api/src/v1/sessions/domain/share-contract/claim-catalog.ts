import {
  isAgeOverClaim as sharedIsAgeOverClaim,
  isDOBClaim as sharedIsDOBClaim,
  isKnownStaticClaim as sharedIsKnownStaticClaim,
  maxAgeThreshold as sharedMaxAgeThreshold,
  maxReasonLength as sharedMaxReasonLength,
  maxShareFields as sharedMaxShareFields,
  minAgeThreshold as sharedMinAgeThreshold,
  parseAgeOverThreshold as sharedParseAgeOverThreshold,
  staticClaims as sharedStaticClaims,
} from "@kayle-id/config/share-claims";

export const staticClaims = sharedStaticClaims;
export const maxShareFields = sharedMaxShareFields;
export const maxReasonLength = sharedMaxReasonLength;
export const minAgeThreshold = sharedMinAgeThreshold;
export const maxAgeThreshold = sharedMaxAgeThreshold;

export function isKnownStaticClaim(claimKey: string): boolean {
  return sharedIsKnownStaticClaim(claimKey);
}

export function parseAgeOverThreshold(claimKey: string): number | null {
  return sharedParseAgeOverThreshold(claimKey);
}

export function isAgeOverClaim(claimKey: string): boolean {
  return sharedIsAgeOverClaim(claimKey);
}

export function isDOBClaim(claimKey: string): boolean {
  return sharedIsDOBClaim(claimKey);
}
