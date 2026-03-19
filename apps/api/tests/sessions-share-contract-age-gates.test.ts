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

describe("/v1/sessions share contract age gate validation", () => {
  test.serial(
    "Multiple age_over claims return MULTIPLE_AGE_GATES_NOT_ALLOWED",
    async () => {
      const response = await v1.request("/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          share_fields: {
            age_over_18: { required: true, reason: "Age gate 1" },
            age_over_21: { required: true, reason: "Age gate 2" },
          },
        }),
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("MULTIPLE_AGE_GATES_NOT_ALLOWED");
    }
  );

  test.serial(
    "DOB + age_over conflict returns DOB_AND_AGE_GATE_CONFLICT",
    async () => {
      const response = await v1.request("/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          share_fields: {
            date_of_birth: { required: true, reason: "DOB" },
            age_over_18: { required: true, reason: "Age gate" },
          },
        }),
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("DOB_AND_AGE_GATE_CONFLICT");
    }
  );

  test.serial("Age gates below 12 return INVALID_AGE_GATE_KEY", async () => {
    const response = await v1.request("/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        share_fields: {
          age_over_11: { required: true, reason: "Invalid threshold" },
        },
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("INVALID_AGE_GATE_KEY");
  });

  test.serial(
    "Invalid age_over format returns INVALID_AGE_GATE_KEY",
    async () => {
      const response = await v1.request("/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_DATA?.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          share_fields: {
            age_over_abc: {
              required: true,
              reason: "Invalid threshold format",
            },
          },
        }),
      });

      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("INVALID_AGE_GATE_KEY");
    }
  );
});
