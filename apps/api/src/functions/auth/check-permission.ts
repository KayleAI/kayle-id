import { db } from "@kayle-id/database/drizzle";
import { auth_organization_members } from "@kayle-id/database/schema/auth";
import { and, eq } from "drizzle-orm";

/**
 * Check if a given user has sufficient permissions to perform an action in an organization.
 *
 * @todo For now, it's just role-based permissions, but we'll need to add more granular permissions in the future. (i.e., right now, any user in an organization can perform actions)
 *
 * @param userId - The ID of the user to check permissions for
 * @param organizationId - The ID of the organization to check permissions for
 * @param permissions - The permissions to check
 * @returns True if the user has the necessary permissions, false otherwise
 */
export async function checkPermission(
  userId: string,
  organizationId: string,
  _permissions?: string[]
): Promise<boolean> {
  const [member] = await db
    .select()
    .from(auth_organization_members)
    .where(
      and(
        eq(auth_organization_members.userId, userId),
        eq(auth_organization_members.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!member) {
    return false;
  }

  return true;
}
