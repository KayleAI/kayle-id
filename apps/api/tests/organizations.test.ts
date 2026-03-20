import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { auth } from "@kayle-id/auth/server";
import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import {
  auth_organization_members,
  auth_organizations,
} from "@kayle-id/database/schema/auth";
import { and, eq, inArray } from "drizzle-orm";
import app from "@/index";
import {
  type SessionAuthTestData,
  setupSessionAuth,
  teardownSessionAuth,
} from "./session-auth";

type OrganizationCreateResponse = {
  data: null | {
    id: string;
  };
  error: null | {
    code: string;
    docs?: string;
    hint?: string;
    message: string;
  };
};

let TEST_DATA: SessionAuthTestData | undefined;
const createdOrganizationIds: string[] = [];
const originalCreateOrganization = auth.api.createOrganization;
const originalStorage = env.STORAGE;
type StorageBinding = NonNullable<typeof env.STORAGE>;
const LOCAL_LOGO_URL_PATTERN = /^http:\/\/127\.0\.0\.1:8787\/r2\/logos\//u;
const LOGO_SLUG_PATTERN = /^logo-/u;

function requireTestData(): SessionAuthTestData {
  if (!TEST_DATA) {
    throw new Error("organizations_test_data_missing");
  }

  return TEST_DATA;
}

function createJsonHeaders(cookie?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

beforeAll(async () => {
  TEST_DATA = await setupSessionAuth();
});

afterEach(async () => {
  auth.api.createOrganization = originalCreateOrganization;
  (
    env as typeof env & {
      STORAGE: typeof env.STORAGE;
    }
  ).STORAGE = originalStorage;
  mock.restore();

  if (createdOrganizationIds.length === 0) {
    return;
  }

  await db
    .delete(auth_organizations)
    .where(inArray(auth_organizations.id, [...createdOrganizationIds]));
  createdOrganizationIds.length = 0;
});

afterAll(async () => {
  await teardownSessionAuth(TEST_DATA);
  TEST_DATA = undefined;
});

describe("Organization Endpoints", () => {
  test("returns unauthorized without a session cookie", async () => {
    const response = await app.request("/v1/auth/orgs", {
      body: JSON.stringify({
        name: "Unauthorized Organization",
        slug: `unauthorized-${crypto.randomUUID()}`,
      }),
      headers: createJsonHeaders(),
      method: "POST",
    });

    expect(response.status).toBe(401);

    const payload = (await response.json()) as {
      error: {
        code: string;
        message: string;
      };
    };

    expect(payload.error).toEqual({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  });

  test("creates an organization for an authenticated session", async () => {
    const testData = requireTestData();
    const slug = `org-${crypto.randomUUID()}`;
    const response = await app.request("/v1/auth/orgs", {
      body: JSON.stringify({
        name: "Created Organization",
        slug,
      }),
      headers: createJsonHeaders(testData.sessionCookie),
      method: "POST",
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as OrganizationCreateResponse;
    const organizationId = payload.data?.id ?? "";

    expect(payload.error).toBeNull();
    expect(organizationId).toBeString();
    createdOrganizationIds.push(organizationId);

    const [organization] = await db
      .select({
        id: auth_organizations.id,
        name: auth_organizations.name,
        slug: auth_organizations.slug,
      })
      .from(auth_organizations)
      .where(eq(auth_organizations.id, organizationId))
      .limit(1);
    const [membership] = await db
      .select({
        organizationId: auth_organization_members.organizationId,
        userId: auth_organization_members.userId,
      })
      .from(auth_organization_members)
      .where(
        and(
          eq(auth_organization_members.organizationId, organizationId),
          eq(auth_organization_members.userId, testData.userId)
        )
      )
      .limit(1);

    expect(organization).toEqual({
      id: organizationId,
      name: "Created Organization",
      slug,
    });
    expect(membership).toEqual({
      organizationId,
      userId: testData.userId,
    });
  });

  test("uploads a logo and forwards the generated logo URL to organization creation", async () => {
    const testData = requireTestData();
    const mockedOrganizationId = crypto.randomUUID();
    let capturedCreateOrganizationBody:
      | {
          logo?: string;
          name: string;
          slug: string;
          userId: string;
        }
      | undefined;
    let capturedStorageContentType: string | undefined;
    let capturedStorageKey: string | undefined;
    let capturedStorageSize = 0;

    auth.api.createOrganization = mock(({ body }) => {
      capturedCreateOrganizationBody = body as {
        logo?: string;
        name: string;
        slug: string;
        userId: string;
      };

      return {
        id: mockedOrganizationId,
      };
    }) as unknown as typeof auth.api.createOrganization;
    (
      env as typeof env & {
        STORAGE: StorageBinding;
      }
    ).STORAGE = {
      ...(originalStorage ?? ({} as StorageBinding)),
      put: mock((key, value, options) => {
        capturedStorageKey = key;
        capturedStorageContentType = options?.httpMetadata?.contentType;
        capturedStorageSize =
          value instanceof Uint8Array ? value.byteLength : String(value).length;

        return Promise.resolve({
          key,
        } as R2Object);
      }) as unknown as StorageBinding["put"],
    } as unknown as StorageBinding;

    const response = await app.request("/v1/auth/orgs", {
      body: JSON.stringify({
        logo: {
          contentType: "image/png",
          data: btoa("tiny-logo"),
        },
        name: "Logo Organization",
        slug: `logo-${crypto.randomUUID()}`,
      }),
      headers: createJsonHeaders(testData.sessionCookie),
      method: "POST",
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as OrganizationCreateResponse;

    expect(payload).toEqual({
      data: {
        id: mockedOrganizationId,
      },
      error: null,
    });
    expect(capturedStorageKey?.startsWith("logos/")).toBeTrue();
    expect(capturedStorageContentType).toBe("image/png");
    expect(capturedStorageSize).toBeGreaterThan(0);
    expect(capturedCreateOrganizationBody).toEqual({
      logo: expect.stringMatching(LOCAL_LOGO_URL_PATTERN),
      name: "Logo Organization",
      slug: expect.stringMatching(LOGO_SLUG_PATTERN),
      userId: testData.userId,
    });
  });

  test("returns a structured internal error when organization creation fails", async () => {
    const testData = requireTestData();

    auth.api.createOrganization = mock(() => {
      throw new Error("organization_create_failed");
    }) as unknown as typeof auth.api.createOrganization;

    const response = await app.request("/v1/auth/orgs", {
      body: JSON.stringify({
        name: "Broken Organization",
        slug: `broken-${crypto.randomUUID()}`,
      }),
      headers: createJsonHeaders(testData.sessionCookie),
      method: "POST",
    });

    expect(response.status).toBe(500);

    const payload = (await response.json()) as OrganizationCreateResponse;

    expect(payload).toEqual({
      data: null,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        docs: "https://kayle.id/docs/api/errors#internal_server_error",
        hint: "Please try again in a few moments.",
        message: "organization_create_failed",
      },
    });
  });
});
