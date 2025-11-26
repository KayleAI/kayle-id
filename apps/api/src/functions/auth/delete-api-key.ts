import { db } from "@kayle-id/database/drizzle";
import { core_api_keys } from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";

/**
 * Verify an API key and return the organization ID and whether it is enabled.
 *
 * @param apiKey - The API key to verify
 * @returns The organization ID and whether it is enabled
 */
export async function deleteApiKey(
  id: string,
  organizationId: string
): Promise<{ status: "success" | "error"; message?: string }> {
  const [deleted] = await db
    .delete(core_api_keys)
    .where(
      and(
        eq(core_api_keys.id, id),
        eq(core_api_keys.organizationId, organizationId)
      )
    )
    .returning({
      deletedId: core_api_keys.id,
    });

  if (!deleted?.deletedId) {
    return {
      status: "error",
      message: "API key not found",
    };
  }

  return { status: "success", message: "API key deleted successfully" };
}
