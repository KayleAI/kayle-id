import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import v1 from "@/v1";
import { setup, type TestData, teardown } from "./setup";

let TEST_DATA: TestData | undefined;

beforeAll(async () => {
  TEST_DATA = await setup();
});

afterAll(async () => {
  await teardown(TEST_DATA);
  TEST_DATA = undefined;
});

describe("/v1/sessions share contract validation", () => {
  test.serial("Unauthorized requests are rejected", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
    });

    expect(response.status).toBe(401);
  });

  test.serial("Can create with explicit share_fields", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        share_fields: {
          age_over_18: {
            required: true,
            reason: "Needed to verify legal age",
          },
          nationality_code: {
            required: false,
            reason: "Needed for regional policy checks",
          },
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        share_fields: Record<string, { source: string; required: boolean }>;
      };
    };
    expect(payload.data.share_fields.age_over_18.source).toBe("rc");
    expect(payload.data.share_fields.nationality_code.source).toBe("rc");
    expect(payload.data.share_fields.kayle_document_id.required).toBe(true);
  });

  test.serial("Missing reason returns REASON_REQUIRED", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        share_fields: {
          nationality_code: {
            required: true,
          },
        },
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("REASON_REQUIRED");
  });

  test.serial("Empty reason returns REASON_REQUIRED", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        share_fields: {
          nationality_code: {
            required: true,
            reason: "   ",
          },
        },
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("REASON_REQUIRED");
  });

  test.serial("Overlong reason returns REASON_TOO_LONG", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        share_fields: {
          nationality_code: {
            required: true,
            reason: "x".repeat(201),
          },
        },
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("REASON_TOO_LONG");
  });

  test.serial("Unknown claim key returns UNKNOWN_CLAIM_KEY", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        share_fields: {
          foo_bar: {
            required: true,
            reason: "Unknown field test",
          },
        },
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("UNKNOWN_CLAIM_KEY");
  });

  test.serial(
    "Non-object share_fields returns INVALID_SHARE_FIELDS",
    async () => {
      const response = await v1.request("/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          share_fields: ["nationality_code"],
        }),
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("INVALID_SHARE_FIELDS");
    }
  );

  test.serial(
    "More than max share fields returns TOO_MANY_SHARE_FIELDS",
    async () => {
      const shareFields = Object.fromEntries(
        Array.from({ length: 33 }, (_, index) => [
          `field_${index}`,
          { required: true, reason: `reason-${index}` },
        ])
      );
      const response = await v1.request("/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          share_fields: shareFields,
        }),
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("TOO_MANY_SHARE_FIELDS");
    }
  );
});
