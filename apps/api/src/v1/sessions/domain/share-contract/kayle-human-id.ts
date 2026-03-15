import { env } from "@kayle-id/config/env";
import { createHMAC } from "@/functions/hmac";

function normalizeTuplePart(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function createKayleHumanId({
  organizationId,
  surname,
  givenNames,
  dateOfBirth,
  nationality,
  sex,
  secret = env.AUTH_SECRET,
}: {
  organizationId: string;
  surname: string;
  givenNames: string;
  dateOfBirth: string;
  nationality: string;
  sex: string;
  secret?: string;
}) {
  return createHMAC(
    [
      organizationId.trim(),
      normalizeTuplePart(surname),
      normalizeTuplePart(givenNames),
      normalizeTuplePart(dateOfBirth),
      normalizeTuplePart(nationality),
      normalizeTuplePart(sex),
    ].join("|"),
    {
      algorithm: "SHA256",
      secret,
    }
  );
}
