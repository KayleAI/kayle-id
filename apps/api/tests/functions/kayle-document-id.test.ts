import { expect, test } from "bun:test";
import {
  createKayleDocumentId,
  normalizeDocumentTuple,
} from "@/v1/sessions/domain/share-contract/kayle-document-id";

const organizationId = "org_123";
const secret = "phase1-test-secret";

test("normalizeDocumentTuple canonicalizes document tuple parts", () => {
  const normalized = normalizeDocumentTuple({
    countryCode: " gb ",
    documentType: " p ",
    documentNumber: " 12 34 567 ",
  });

  expect(normalized).toEqual({
    countryCode: "GB",
    documentType: "P",
    documentNumber: "1234567",
  });
});

test("createKayleDocumentId is deterministic for same org + tuple", async () => {
  const first = await createKayleDocumentId({
    organizationId,
    countryCode: "GB",
    documentType: "P",
    documentNumber: "1234567",
    secret,
  });

  const second = await createKayleDocumentId({
    organizationId,
    countryCode: " gb ",
    documentType: "p",
    documentNumber: "12 34 567",
    secret,
  });

  expect(first).toBe(second);
});

test("createKayleDocumentId is organization-scoped", async () => {
  const orgA = await createKayleDocumentId({
    organizationId: "org_A",
    countryCode: "GB",
    documentType: "P",
    documentNumber: "1234567",
    secret,
  });

  const orgB = await createKayleDocumentId({
    organizationId: "org_B",
    countryCode: "GB",
    documentType: "P",
    documentNumber: "1234567",
    secret,
  });

  expect(orgA).not.toBe(orgB);
});

test("createKayleDocumentId changes when tuple changes", async () => {
  const first = await createKayleDocumentId({
    organizationId,
    countryCode: "GB",
    documentType: "P",
    documentNumber: "1234567",
    secret,
  });

  const second = await createKayleDocumentId({
    organizationId,
    countryCode: "GB",
    documentType: "P",
    documentNumber: "7654321",
    secret,
  });

  expect(first).not.toBe(second);
});
