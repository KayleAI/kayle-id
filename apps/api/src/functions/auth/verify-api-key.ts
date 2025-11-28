import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { api_keys } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import { createHMAC } from "@/functions/hmac";

/**
 * Verify an API key and return the organization ID and whether it is enabled.
 *
 * @param apiKey - The API key to verify
 * @returns The organization ID and whether it is enabled
 */
export async function verifyApiKey(
  apiKey: string
): Promise<{ organizationId: string | null; enabled: boolean | null }> {
  const keyHash = await createHMAC(apiKey, {
    algorithm: "SHA256",
    secret: env.AUTH_SECRET,
  });

  // search for the key hash in the database
  const [
    { organizationId, enabled } = { organizationId: null, enabled: null },
  ] = await db
    .select({
      organizationId: api_keys.organizationId,
      enabled: api_keys.enabled,
    })
    .from(api_keys)
    .where(eq(api_keys.keyHash, keyHash))
    .limit(1);

  if (!organizationId) {
    return { organizationId: null, enabled: null };
  }

  return { organizationId, enabled };
}
