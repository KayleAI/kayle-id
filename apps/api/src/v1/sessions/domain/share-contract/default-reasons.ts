import { defaultReasonForClaim as sharedDefaultReasonForClaim } from "@kayle-id/config/share-claims";

export function defaultReasonForClaim(claimKey: string): string {
  return sharedDefaultReasonForClaim(claimKey);
}
