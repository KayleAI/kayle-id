import { env } from "@kayle-id/config/env";
import { createHMAC } from "@/functions/hmac";

function normalizeTuplePart(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeDocumentTuple({
  countryCode,
  documentType,
  documentNumber,
}: {
  countryCode: string;
  documentType: string;
  documentNumber: string;
}) {
  return {
    countryCode: normalizeTuplePart(countryCode),
    documentType: normalizeTuplePart(documentType),
    documentNumber: normalizeTuplePart(documentNumber),
  };
}

export function createKayleDocumentId({
  organizationId,
  countryCode,
  documentType,
  documentNumber,
  secret = env.AUTH_SECRET,
}: {
  organizationId: string;
  countryCode: string;
  documentType: string;
  documentNumber: string;
  secret?: string;
}) {
  const normalized = normalizeDocumentTuple({
    countryCode,
    documentType,
    documentNumber,
  });

  return createHMAC(
    [
      organizationId.trim(),
      normalized.countryCode,
      normalized.documentType,
      normalized.documentNumber,
    ].join("|"),
    {
      algorithm: "SHA256",
      secret,
    }
  );
}
