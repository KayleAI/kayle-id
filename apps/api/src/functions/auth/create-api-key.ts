import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { core_api_keys } from "@kayle-id/database/schema/core";
import { createHMAC } from "@/functions/hmac";

function generateRandomString(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const randomBytes = new Uint8Array(length);

  crypto.getRandomValues(randomBytes);

  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += alphabet[randomBytes[i] % alphabet.length];
  }

  return result;
}

/**
 * Create an API key and return the key hash.
 *
 * @param organizationId - The organization ID to create the API key for
 * @returns The API key hash
 */
export async function createApiKey({
  name,
  organizationId,
  metadata = {},
  permissions = [],
}: {
  name: string;
  organizationId: string;
  permissions?: string[];
  metadata?: Record<string, string | number | boolean>;
}): Promise<{ id: string; apiKey: string }> {
  const apiKey = `kk_${generateRandomString(32)}`;

  const keyHash = await createHMAC(apiKey, {
    algorithm: "SHA256",
    secret: env.AUTH_SECRET,
  });

  const [created] = await db
    .insert(core_api_keys)
    .values({
      name,
      organizationId,
      keyHash,
      permissions,
      metadata,
    })
    .returning({
      id: core_api_keys.id,
    });

  if (!created?.id) {
    throw new Error("Failed to create API key");
  }

  return {
    id: created.id,
    apiKey,
  };
}
