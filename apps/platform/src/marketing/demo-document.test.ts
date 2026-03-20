import { expect, test } from "vitest";
import {
  buildDemoDocumentPreview,
  buildPassportMachineReadableZone,
  formatDemoClaimValue,
  formatDemoDocumentDate,
  inferDemoDocumentKind,
  parseDemoDecryptedWebhook,
} from "./demo-document";

test("parseDemoDecryptedWebhook reads claims and selected field keys", () => {
  const parsed = parseDemoDecryptedWebhook(
    JSON.stringify({
      type: "verification.attempt.succeeded",
      data: {
        claims: {
          document_number: "123456789",
          family_name: "DOE",
        },
        selected_field_keys: ["document_number", "family_name"],
      },
      metadata: {
        contract_version: 1,
        verification_session_id: "vs_demo_test",
      },
    })
  );

  expect(parsed).toEqual({
    claims: {
      document_number: "123456789",
      family_name: "DOE",
    },
    contractVersion: 1,
    selectedFieldKeys: ["document_number", "family_name"],
    type: "verification.attempt.succeeded",
    verificationSessionId: "vs_demo_test",
  });
});

test("buildDemoDocumentPreview defaults to passport when no document type code is present", () => {
  const preview = buildDemoDocumentPreview(
    JSON.stringify({
      data: {
        claims: {
          family_name: "DOE",
          given_names: "JANE MARIE",
          document_number: "123456789",
        },
      },
    })
  );

  expect(preview?.documentKind).toBe("passport");
  expect(preview?.title).toBe("Passport");
});

test("inferDemoDocumentKind treats MRZ I-codes as identity cards", () => {
  expect(inferDemoDocumentKind("I")).toBe("id-card");
  expect(inferDemoDocumentKind("ID")).toBe("id-card");
  expect(inferDemoDocumentKind("P")).toBe("passport");
});

test("formatDemoDocumentDate renders ISO dates in document style", () => {
  expect(formatDemoDocumentDate("2032-04-16")).toBe("16 APR 2032");
  expect(formatDemoDocumentDate("not-a-date")).toBe("not-a-date");
});

test("formatDemoClaimValue summarizes document photos", () => {
  expect(
    formatDemoClaimValue("document_photo", {
      dataBase64: "abc123",
      format: "jpeg2000",
      height: 640,
      width: 480,
    })
  ).toBe("Chip portrait · JPEG2000 · 480×640");
});

test("buildPassportMachineReadableZone formats a TD3 passport footer", () => {
  expect(
    buildPassportMachineReadableZone({
      dateOfBirth: "1990-04-12",
      documentExpiryDate: "2032-04-16",
      documentNumber: "123456789",
      documentTypeCode: "P",
      familyName: "Doe",
      givenNames: "Jane Marie",
      issuingCountryCode: "GBR",
      mrzOptionalData: "ABC12345",
      nationalityCode: "GBR",
      sexMarker: "F",
    })
  ).toEqual([
    "P<GBRDOE<<JANE<MARIE<<<<<<<<<<<<<<<<<<<<<<<<",
    "1234567897GBR9004126F3204164ABC12345<<<<<<46",
  ]);
});

test("buildPassportMachineReadableZone keeps MRZ structure for partial claims", () => {
  const mrz = buildPassportMachineReadableZone({
    dateOfBirth: null,
    documentExpiryDate: null,
    documentNumber: null,
    documentTypeCode: "P",
    familyName: null,
    givenNames: "ARSEN",
    issuingCountryCode: null,
    mrzOptionalData: null,
    nationalityCode: null,
    sexMarker: null,
  });

  expect(mrz[0]).toHaveLength(44);
  expect(mrz[1]).toHaveLength(44);
  expect(mrz[0]).toContain("ARSEN");
});

test("buildDemoDocumentPreview includes machine readable zone for passports", () => {
  const preview = buildDemoDocumentPreview(
    JSON.stringify({
      data: {
        claims: {
          date_of_birth: "1990-04-12",
          document_expiry_date: "2032-04-16",
          document_number: "123456789",
          document_type_code: "P",
          family_name: "DOE",
          given_names: "JANE MARIE",
          issuing_country_code: "GBR",
          nationality_code: "GBR",
          sex_marker: "F",
        },
      },
    })
  );

  expect(preview?.machineReadableZone).toEqual([
    "P<GBRDOE<<JANE<MARIE<<<<<<<<<<<<<<<<<<<<<<<<",
    "1234567897GBR9004126F3204164<<<<<<<<<<<<<<08",
  ]);
});
