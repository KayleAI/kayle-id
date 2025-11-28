import { db } from "@kayle-id/database/drizzle";
import { api_keys } from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";

/**
 * Update an API key.
 *
 * @param id - The ID of the API key to update
 * @param organizationId - The organization ID to update the API key for
 * @param options - Updatable options
 * @returns The status of the update
 */
export async function updateApiKey(
  id: string,
  organizationId: string,
  {
    name,
    enabled,
    permissions,
    metadata,
  }: {
    name?: string;
    enabled?: boolean;
    permissions?: string[];
    metadata?: Record<string, string | number | boolean>;
  }
): Promise<{ status: "success" | "error"; message?: string }> {
  const [updated] = await db
    .update(api_keys)
    .set({
      name,
      enabled,
      permissions,
      metadata,
    })
    .where(
      and(eq(api_keys.id, id), eq(api_keys.organizationId, organizationId))
    )
    .returning({
      updatedId: api_keys.id,
    });

  if (!updated?.updatedId) {
    return {
      status: "error",
      message: "API key not found",
    };
  }

  return {
    status: "success",
    message: "API key updated successfully",
  };
}
