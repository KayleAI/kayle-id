import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@kayle-id/database/drizzle";
import { auth_organizations } from "@kayle-id/database/schema/auth";
import { and, eq } from "drizzle-orm";
import { createApiKey } from "@/functions/auth/create-api-key";
import v1 from "@/v1";
import { setup, TEST_DATA, teardown } from "./setup";

beforeAll(async () => {
  await setup();
});

afterAll(async () => {
  await teardown();
});

describe("/v1/sessions share contract persistence", () => {
  test.serial("Omitted share_fields auto-populates defaults", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        share_fields: Record<string, { source: string; required: boolean }>;
      };
    };

    expect(payload.data.share_fields.dg1_document_type.source).toBe("default");
    expect(payload.data.share_fields.kayle_document_id.required).toBe(true);
    expect(payload.data.share_fields.kayle_human_id.source).toBe("default");
    expect(payload.data.share_fields.age_over_18).toBeUndefined();
  });

  test.serial("kayle_document_id is always forced required", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        share_fields: {
          kayle_document_id: {
            required: false,
            reason: "RC attempted optional",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        contract_version: number;
        share_fields: Record<string, { required: boolean }>;
      };
    };

    expect(payload.data.contract_version).toBe(1);
    expect(payload.data.share_fields.kayle_document_id.required).toBe(true);
  });

  test.serial(
    "List and get include share_fields + contract_version",
    async () => {
      const createResponse = await v1.request("/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
      });
      expect(createResponse.status).toBe(200);
      const created = (await createResponse.json()) as {
        data: { id: string; contract_version: number };
      };

      const listResponse = await v1.request("/sessions", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
      });
      expect(listResponse.status).toBe(200);
      const listed = (await listResponse.json()) as {
        data: Array<{
          id: string;
          contract_version: number;
          share_fields: object;
        }>;
      };
      const listedItem = listed.data.find(
        (entry) => entry.id === created.data.id
      );
      expect(listedItem?.contract_version).toBe(1);
      expect(listedItem?.share_fields).toBeDefined();

      const getResponse = await v1.request(`/sessions/${created.data.id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        },
      });
      expect(getResponse.status).toBe(200);
      const retrieved = (await getResponse.json()) as {
        data: { contract_version: number; share_fields: object };
      };
      expect(retrieved.data.contract_version).toBe(1);
      expect(retrieved.data.share_fields).toBeDefined();
    }
  );

  test.serial("Org-scoped API key isolation remains enforced", async () => {
    const createResponse = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { data: { id: string } };

    const otherOrgId = crypto.randomUUID();
    const slug = `isolation-${Math.random().toString(36).slice(2, 12)}`;

    await db.insert(auth_organizations).values({
      id: otherOrgId,
      name: "Isolation Org",
      slug,
      createdAt: new Date(),
    });

    const { apiKey: otherOrgApiKey } = await createApiKey({
      name: "Isolation API Key",
      organizationId: otherOrgId,
      environment: "test",
    });

    try {
      const getResponse = await v1.request(`/sessions/${created.data.id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${otherOrgApiKey}`,
        },
      });
      expect(getResponse.status).toBe(404);

      const cancelResponse = await v1.request(
        `/sessions/${created.data.id}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${otherOrgApiKey}`,
          },
        }
      );
      expect(cancelResponse.status).toBe(404);

      const listResponse = await v1.request("/sessions", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${otherOrgApiKey}`,
        },
      });
      expect(listResponse.status).toBe(200);
      const listed = (await listResponse.json()) as {
        data: Array<{ id: string }>;
      };
      expect(
        listed.data.some((session) => session.id === created.data.id)
      ).toBe(false);
    } finally {
      await db
        .delete(auth_organizations)
        .where(
          and(
            eq(auth_organizations.id, otherOrgId),
            eq(auth_organizations.slug, slug)
          )
        );
    }
  });
});
