import { db } from "@kayle-id/database/drizzle";
import { api_keys } from "@kayle-id/database/schema/core";
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
    .delete(api_keys)
    .where(
      and(
        eq(api_keys.id, id),
        eq(api_keys.organizationId, organizationId),
        eq(api_keys.environment, "live")
      )
    )
    .returning({
      deletedId: api_keys.id,
    });

  if (!deleted?.deletedId) {
    return {
      status: "error",
      message: "API key not found",
    };
  }

  return { status: "success", message: "API key deleted successfully" };
}
