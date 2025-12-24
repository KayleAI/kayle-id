import { db } from "@kayle-id/database/drizzle";
import {
  auth_organization_members,
  auth_organizations,
  auth_users,
} from "@kayle-id/database/schema/auth";
import { api_keys } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import { createApiKey } from "@/functions/auth/create-api-key";

let TEST_DATA:
  | {
      userId: string;
      organizationId: string;
      apiKey: string;
      apiKeyId: string;
    }
  | undefined;

const setup = async () => {
  const [createdUser] = await db
    .insert(auth_users)
    .values({
      id: crypto.randomUUID(),
      email: `${Math.random()}@test.kayle.id`,
      name: Math.random().toString(36).substring(2, 15),
    })
    .returning({
      id: auth_users.id,
    })
    .onConflictDoNothing();

  if (!createdUser?.id) {
    throw new Error("Failed to create user");
  }

  const userId = createdUser.id;

  // create an organization for the user
  const [createdOrganization] = await db
    .insert(auth_organizations)
    .values({
      id: crypto.randomUUID(),
      name: "Test Organization",
      slug: Math.random().toString(36).substring(2, 15),
      createdAt: new Date(),
    })
    .returning({
      id: auth_organizations.id,
    });

  if (!createdOrganization?.id) {
    throw new Error("Failed to create organization");
  }

  const organizationId = createdOrganization.id;

  // add the user to the organization
  await db.insert(auth_organization_members).values({
    organizationId,
    createdAt: new Date(),
    userId,
    role: "owner",
  });

  // create a test API key
  const { apiKey, id: apiKeyId } = await createApiKey({
    name: "Test API Key",
    environment: "test",
    organizationId,
  });

  TEST_DATA = { userId, organizationId, apiKey, apiKeyId };

  return TEST_DATA;
};

const teardown = async () => {
  await db
    .delete(auth_users)
    .where(eq(auth_users.id, TEST_DATA?.userId as string));
  await db
    .delete(auth_organizations)
    .where(eq(auth_organizations.id, TEST_DATA?.organizationId as string));
  await db
    .delete(api_keys)
    .where(eq(api_keys.id, TEST_DATA?.apiKeyId as string));
};

export { setup, teardown, TEST_DATA };
