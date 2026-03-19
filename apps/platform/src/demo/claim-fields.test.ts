import { expect, test } from "bun:test";
import { staticClaims } from "@kayle-id/config/share-claims";
import { buildRequestedShareFields, getClaimDescription } from "./claim-fields";

test("buildRequestedShareFields omits share_fields when every field is off", () => {
  const result = buildRequestedShareFields({
    ageThresholdText: "",
    fieldModes: {
      date_of_birth: "off",
      document_number: "off",
      kayle_document_id: "off",
    },
  });

  expect(result.ok).toBeTrue();
  if (!result.ok) {
    throw new Error(result.message);
  }

  expect(result.shareFields).toEqual({
    kayle_document_id: {
      reason: 'Sharing "Kayle Document ID"',
      required: true,
    },
    kayle_human_id: {
      reason: 'Sharing "Kayle Human ID"',
      required: true,
    },
  });
});

test("buildRequestedShareFields creates required and optional claims plus a single age gate", () => {
  const result = buildRequestedShareFields({
    ageThresholdText: "21",
    fieldModes: {
      document_number: "required",
      nationality_code: "optional",
      date_of_birth: "off",
      kayle_document_id: "off",
      kayle_human_id: "optional",
    },
  });

  expect(result.ok).toBeTrue();
  if (!result.ok) {
    throw new Error(result.message);
  }

  expect(result.shareFields).toEqual({
    age_over_21: {
      reason: 'Sharing "Age Over 21"',
      required: true,
    },
    document_number: {
      reason: 'Sharing "Document Number"',
      required: true,
    },
    nationality_code: {
      reason: 'Sharing "Nationality Code"',
      required: false,
    },
    kayle_document_id: {
      reason: 'Sharing "Kayle Document ID"',
      required: true,
    },
    kayle_human_id: {
      reason: 'Sharing "Kayle Human ID"',
      required: true,
    },
  });
});

test("buildRequestedShareFields rejects DOB plus age gate", () => {
  const result = buildRequestedShareFields({
    ageThresholdText: "18",
    fieldModes: {
      date_of_birth: "required",
    },
  });

  expect(result.ok).toBeFalse();
  if (result.ok) {
    throw new Error("expected_dob_age_gate_conflict");
  }

  expect(result.message).toContain("Date of Birth");
});

test("buildRequestedShareFields rejects age gates below 12", () => {
  const result = buildRequestedShareFields({
    ageThresholdText: "11",
    fieldModes: {
      date_of_birth: "off",
    },
  });

  expect(result.ok).toBeFalse();
  if (result.ok) {
    throw new Error("expected_invalid_min_age_gate");
  }

  expect(result.message).toContain("between 12 and");
});

test("getClaimDescription avoids generic fallback copy for static claims", () => {
  for (const claimKey of staticClaims) {
    expect(getClaimDescription(claimKey).startsWith("Shares ")).toBeFalse();
  }
});

test("getClaimDescription includes the requested threshold for age gates", () => {
  expect(getClaimDescription("age_over_21")).toContain("21");
  expect(getClaimDescription("age_over_21")).toContain(
    "without sharing the full date of birth"
  );
});
