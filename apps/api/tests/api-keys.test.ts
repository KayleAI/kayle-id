import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@kayle-id/database/drizzle";
import { auth_organization_members } from "@kayle-id/database/schema/auth";
import { api_keys } from "@kayle-id/database/schema/core";
import { and, eq } from "drizzle-orm";
import { createApiKey } from "@/functions/auth/create-api-key";
import { verifyApiKey } from "@/functions/auth/verify-api-key";
import app from "@/index";
import {
  type SessionAuthTestData,
  setupSessionAuth,
  teardownSessionAuth,
} from "./session-auth";

type ApiKeysRouteTestData = SessionAuthTestData & {
  apiKey: string;
  apiKeyId: string;
};

type ApiKeysListResponse = {
  data: Array<{
    enabled: boolean;
    id: string;
    name: string;
  }>;
  error: null | {
    code: string;
    docs?: string;
    hint?: string;
    message: string;
  };
  pagination?: {
    has_more: boolean;
    limit: number;
    next_cursor: string | null;
  };
};

type ApiKeyMutationResponse = {
  data: null | {
    id?: string;
    key?: string;
    message?: string;
    status?: "success";
  };
  error: null | {
    code: string;
    docs?: string;
    hint?: string;
    message: string;
  };
};

let TEST_DATA: ApiKeysRouteTestData | undefined;
let FORBIDDEN_TEST_DATA: SessionAuthTestData | undefined;

function requireOrganizationId(organizationId: string | null): string {
  if (!organizationId) {
    throw new Error("api_keys_test_organization_missing");
  }

  return organizationId;
}

function requireTestData(): ApiKeysRouteTestData {
  if (!TEST_DATA) {
    throw new Error("api_keys_test_data_missing");
  }

  return TEST_DATA;
}

function requireForbiddenTestData(): SessionAuthTestData {
  if (!FORBIDDEN_TEST_DATA) {
    throw new Error("api_keys_forbidden_test_data_missing");
  }

  return FORBIDDEN_TEST_DATA;
}

function createJsonHeaders(cookie: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
}

beforeAll(async () => {
  const sessionTestData = await setupSessionAuth({
    withActiveOrganization: true,
  });
  const organizationId = requireOrganizationId(sessionTestData.organizationId);
  const { apiKey, id: apiKeyId } = await createApiKey({
    name: "Test API Key",
    organizationId,
  });

  TEST_DATA = {
    ...sessionTestData,
    apiKey,
    apiKeyId,
  };
  FORBIDDEN_TEST_DATA = await setupSessionAuth({
    withActiveOrganization: true,
  });
});

afterAll(async () => {
  await teardownSessionAuth(TEST_DATA);
  TEST_DATA = undefined;
  await teardownSessionAuth(FORBIDDEN_TEST_DATA);
  FORBIDDEN_TEST_DATA = undefined;
});

describe("API Key Endpoints", () => {
  test("lists API keys for an authenticated session", async () => {
    const testData = requireTestData();
    const response = await app.request("/v1/auth/api-keys", {
      headers: createJsonHeaders(testData.sessionCookie),
      method: "GET",
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as ApiKeysListResponse;

    expect(payload.error).toBeNull();
    expect(payload.pagination).toEqual({
      has_more: false,
      limit: 10,
      next_cursor: null,
    });
    expect(payload.data).toContainEqual(
      expect.objectContaining({
        enabled: true,
        id: testData.apiKeyId,
        name: "Test API Key",
      })
    );
  });

  test("creates an API key for an authenticated session", async () => {
    const testData = requireTestData();
    const organizationId = requireOrganizationId(testData.organizationId);
    const response = await app.request("/v1/auth/api-keys", {
      body: JSON.stringify({
        name: "Created API Key",
      }),
      headers: createJsonHeaders(testData.sessionCookie),
      method: "POST",
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as ApiKeyMutationResponse;

    expect(payload.error).toBeNull();
    expect(payload.data?.id).toBeString();
    expect(payload.data?.key?.startsWith("kk_live_")).toBeTrue();

    const verification = await verifyApiKey(payload.data?.key ?? "");
    expect(verification).toEqual({
      enabled: true,
      organizationId,
    });
  });

  test("updates an API key for an authenticated session", async () => {
    const testData = requireTestData();
    const organizationId = requireOrganizationId(testData.organizationId);
    const { apiKey, id } = await createApiKey({
      name: "Before Update",
      organizationId,
    });
    const response = await app.request(`/v1/auth/api-keys/${id}`, {
      body: JSON.stringify({
        enabled: false,
        name: "After Update",
      }),
      headers: createJsonHeaders(testData.sessionCookie),
      method: "PATCH",
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as ApiKeyMutationResponse;
    const [updatedApiKey] = await db
      .select({
        enabled: api_keys.enabled,
        name: api_keys.name,
      })
      .from(api_keys)
      .where(eq(api_keys.id, id))
      .limit(1);

    expect(payload).toEqual({
      data: {
        message: "API key updated successfully",
        status: "success",
      },
      error: null,
    });
    expect(updatedApiKey).toEqual({
      enabled: false,
      name: "After Update",
    });

    const verification = await verifyApiKey(apiKey);
    expect(verification).toEqual({
      enabled: false,
      organizationId,
    });
  });

  test("deletes an API key for an authenticated session", async () => {
    const testData = requireTestData();
    const organizationId = requireOrganizationId(testData.organizationId);
    const { apiKey, id } = await createApiKey({
      name: "Delete Me",
      organizationId,
    });
    const response = await app.request(`/v1/auth/api-keys/${id}`, {
      headers: createJsonHeaders(testData.sessionCookie),
      method: "DELETE",
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as ApiKeyMutationResponse;

    expect(payload).toEqual({
      data: {
        message: "API key deleted successfully",
        status: "success",
      },
      error: null,
    });

    const verification = await verifyApiKey(apiKey);
    expect(verification).toEqual({
      enabled: null,
      organizationId: null,
    });
  });

  test("returns route-level not-found errors for missing API keys", async () => {
    const testData = requireTestData();
    const missingId = crypto.randomUUID();
    const updateResponse = await app.request(`/v1/auth/api-keys/${missingId}`, {
      body: JSON.stringify({
        enabled: false,
      }),
      headers: createJsonHeaders(testData.sessionCookie),
      method: "PATCH",
    });
    const deleteResponse = await app.request(`/v1/auth/api-keys/${missingId}`, {
      headers: createJsonHeaders(testData.sessionCookie),
      method: "DELETE",
    });

    expect(updateResponse.status).toBe(400);
    expect(deleteResponse.status).toBe(400);

    const updatePayload =
      (await updateResponse.json()) as ApiKeyMutationResponse;
    const deletePayload =
      (await deleteResponse.json()) as ApiKeyMutationResponse;

    expect(updatePayload.error?.code).toBe("API_KEY_NOT_FOUND");
    expect(deletePayload.error?.code).toBe("API_KEY_NOT_DELETED");
  });

  test("returns forbidden for session-auth API-key routes when membership is missing", async () => {
    const testData = requireForbiddenTestData();
    const organizationId = requireOrganizationId(testData.organizationId);
    const { id } = await createApiKey({
      name: "Forbidden API Key",
      organizationId,
    });

    await db
      .delete(auth_organization_members)
      .where(
        and(
          eq(auth_organization_members.organizationId, organizationId),
          eq(auth_organization_members.userId, testData.userId)
        )
      );

    const requests = await Promise.all([
      app.request("/v1/auth/api-keys", {
        headers: createJsonHeaders(testData.sessionCookie),
        method: "GET",
      }),
      app.request("/v1/auth/api-keys", {
        body: JSON.stringify({
          name: "Forbidden Create",
        }),
        headers: createJsonHeaders(testData.sessionCookie),
        method: "POST",
      }),
      app.request(`/v1/auth/api-keys/${id}`, {
        body: JSON.stringify({
          enabled: false,
        }),
        headers: createJsonHeaders(testData.sessionCookie),
        method: "PATCH",
      }),
      app.request(`/v1/auth/api-keys/${id}`, {
        headers: createJsonHeaders(testData.sessionCookie),
        method: "DELETE",
      }),
    ]);

    for (const response of requests) {
      expect(response.status).toBe(403);

      const payload = (await response.json()) as ApiKeyMutationResponse;
      expect(payload.error?.code).toBe("FORBIDDEN");
    }
  });

  test("ensures API keys cannot be listed using an API key", async () => {
    const testData = requireTestData();
    const response = await app.request("/v1/auth/api-keys", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testData.apiKey}`,
      },
      method: "GET",
    });

    expect(response.status).toBe(401);
  });
});
