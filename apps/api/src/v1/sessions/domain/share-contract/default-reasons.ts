import { parseAgeOverThreshold } from "./claim-catalog";

const claimLabels: Record<string, string> = {
  dg1_document_type: "Document Type",
  dg1_issuing_country: "Issuing Country",
  dg1_surname: "Surname",
  dg1_given_names: "Given Names",
  dg1_document_number: "Document Number",
  dg1_nationality: "Nationality",
  dg1_date_of_birth: "Date of Birth",
  dg1_sex: "Sex",
  dg1_expiry_date: "Document Expiry Date",
  dg1_optional_data: "Additional Document Data",
  dg2_face_image: "Document Face Image",
  kayle_document_id: "Kayle Document ID",
  kayle_human_id: "Kayle Human ID",
};

export function defaultReasonForClaim(claimKey: string): string {
  const ageThreshold = parseAgeOverThreshold(claimKey);
  if (ageThreshold) {
    return `Sharing "Age Over ${ageThreshold}"`;
  }

  const label = claimLabels[claimKey] ?? claimKey;
  return `Sharing "${label}"`;
}
