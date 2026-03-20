import { db } from "@kayle-id/database/drizzle";
import {
  auth_organization_members,
  auth_organizations,
  auth_users,
} from "@kayle-id/database/schema/auth";
import { api_keys } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import { createApiKey } from "@/functions/auth/create-api-key";

type TestData = {
  userId: string;
  organizationId: string;
  apiKey: string;
  apiKeyId: string;
};

const setup = async (): Promise<TestData> => {
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

  await db.insert(auth_organization_members).values({
    organizationId,
    createdAt: new Date(),
    userId,
    role: "owner",
  });

  const { apiKey, id: apiKeyId } = await createApiKey({
    name: "Test API Key",
    environment: "test",
    organizationId,
  });

  return { userId, organizationId, apiKey, apiKeyId };
};

const teardown = async (testData?: TestData): Promise<void> => {
  if (!testData) {
    return;
  }

  await db.delete(auth_users).where(eq(auth_users.id, testData.userId));
  await db
    .delete(auth_organizations)
    .where(eq(auth_organizations.id, testData.organizationId));
  await db.delete(api_keys).where(eq(api_keys.id, testData.apiKeyId));
};

export { setup, teardown, type TestData };
