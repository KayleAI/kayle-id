import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auth } from "@kayle-id/auth/server";
import { db } from "@kayle-id/database/drizzle";
import {
  auth_organization_members,
  auth_organizations,
  auth_users,
} from "@kayle-id/database/schema/auth";
import { eq } from "drizzle-orm";
import apiKeys from "@/auth/api-keys";
import { createApiKey } from "@/functions/auth/create-api-key";

type TestData = {
  apiKey: string;
  apiKeyId: string;
  organizationId: string;
  sessionCookie: string;
  userId: string;
};

let TEST_DATA: TestData | undefined;

const COOKIE_HEADER_SPLIT_PATTERN = /;\s*/u;
const SET_COOKIE_SPLIT_PATTERN = /, (?=[^;]+?=)/u;

function requireTestData(): TestData {
  if (!TEST_DATA) {
    throw new Error("api_keys_test_data_missing");
  }

  return TEST_DATA;
}

function getSetCookieHeader(response: Response): string | null {
  const setCookies = response.headers.getSetCookie();

  if (setCookies.length > 0) {
    return setCookies.join(", ");
  }

  return response.headers.get("set-cookie");
}

function mergeCookieHeader(
  currentCookieHeader: string | null,
  setCookieHeader: string | null
): string {
  const cookies = new Map<string, string>();

  if (currentCookieHeader) {
    for (const part of currentCookieHeader.split(COOKIE_HEADER_SPLIT_PATTERN)) {
      const [name, ...valueParts] = part.split("=");
      const value = valueParts.join("=");

      if (name && value) {
        cookies.set(name, value);
      }
    }
  }

  if (setCookieHeader) {
    for (const cookie of setCookieHeader.split(SET_COOKIE_SPLIT_PATTERN)) {
      const [cookiePair] = cookie.split(";");
      const separatorIndex = cookiePair.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      cookies.set(
        cookiePair.slice(0, separatorIndex),
        cookiePair.slice(separatorIndex + 1)
      );
    }
  }

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function setup(): Promise<TestData> {
  const organizationId = crypto.randomUUID();
  const credentials = {
    email: `${crypto.randomUUID()}@test.kayle.id`,
    name: "Test User",
    password: "test123456",
  };

  await db.insert(auth_organizations).values({
    createdAt: new Date(),
    id: organizationId,
    name: "Test Organization",
    slug: Math.random().toString(36).substring(2, 15),
  });

  const signUpResponse = await auth.api.signUpEmail({
    asResponse: true,
    body: credentials,
  });

  if (!signUpResponse.ok) {
    throw new Error(`auth_sign_up_failed:${signUpResponse.status}`);
  }

  const signUpPayload = (await signUpResponse.json()) as {
    user: { id: string };
  };

  await db.insert(auth_organization_members).values({
    createdAt: new Date(),
    organizationId,
    role: "owner",
    userId: signUpPayload.user.id,
  });

  const signUpCookie = mergeCookieHeader(
    null,
    getSetCookieHeader(signUpResponse)
  );
  const setActiveOrganizationResponse = await auth.api.setActiveOrganization({
    asResponse: true,
    body: {
      organizationId,
    },
    headers: new Headers({
      cookie: signUpCookie,
    }),
  });

  if (!setActiveOrganizationResponse.ok) {
    throw new Error(
      `auth_set_active_organization_failed:${setActiveOrganizationResponse.status}`
    );
  }

  const { apiKey, id: apiKeyId } = await createApiKey({
    environment: "test",
    name: "Test API Key",
    organizationId,
  });

  return {
    apiKey,
    apiKeyId,
    organizationId,
    sessionCookie: mergeCookieHeader(
      signUpCookie,
      getSetCookieHeader(setActiveOrganizationResponse)
    ),
    userId: signUpPayload.user.id,
  };
}

async function teardown(testData?: TestData): Promise<void> {
  if (!testData) {
    return;
  }

  await db.delete(auth_users).where(eq(auth_users.id, testData.userId));
  await db
    .delete(auth_organizations)
    .where(eq(auth_organizations.id, testData.organizationId));
}

beforeAll(async () => {
  TEST_DATA = await setup();
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
});

describe("API Key Endpoints", () => {
  test("Lists API keys for an authenticated session", async () => {
    const testData = requireTestData();
    const response = await apiKeys.request("/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: testData.sessionCookie,
      },
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      data: Array<{
        enabled: boolean;
        environment: "live" | "test";
        id: string;
        name: string;
      }>;
      error: null;
      pagination: {
        has_more: boolean;
        limit: number;
        next_cursor: string | null;
      };
    };

    expect(payload.error).toBeNull();
    expect(payload.pagination.limit).toBe(10);
    expect(payload.pagination.has_more).toBe(false);
    expect(payload.data.length).toBeGreaterThan(0);
    expect(payload.data).toContainEqual(
      expect.objectContaining({
        enabled: true,
        environment: "test",
        id: testData.apiKeyId,
        name: "Test API Key",
      })
    );
  });

  test("Ensure API Keys cannot be listed using an API key", async () => {
    const testData = requireTestData();
    const response = await apiKeys.request("/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testData.apiKey}`,
      },
    });

    expect(response.status).toBe(401);
  });
});
