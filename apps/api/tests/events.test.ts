import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auth } from "@kayle-id/auth/server";
import { db } from "@kayle-id/database/drizzle";
import { auth_users } from "@kayle-id/database/schema/auth";
import { file } from "bun";
import { eq } from "drizzle-orm";
import { compactDecrypt, importPKCS8 } from "jose";
import events from "@/v1/events";

type EventTestData = {
  userId: string;
  apiKey: string;
  eventId: string;
};

let TEST_DATA: EventTestData | undefined;

beforeAll(async () => {
  // TODO: Create a demo event using the public key from the secrets directory

  const [user] = await db
    .insert(auth_users)
    .values({
      id: crypto.randomUUID(),
      email: `${Math.random()}@example.com`,
      name: Math.random().toString(36).substring(2, 15),
    })
    .returning({
      id: auth_users.id,
    })
    .onConflictDoNothing();

  const { key } = await auth.api.createApiKey({
    body: {
      name: "Test API Key",
      userId: user.id,
    },
  });

  // TODO: create a demo event

  TEST_DATA = {
    userId: user.id,
    apiKey: key,
    eventId: "test-event-id",
  };
});

afterAll(async () => {
  // Deleting the test user will automatically delete the test API key
  await db
    .delete(auth_users)
    .where(eq(auth_users.id, TEST_DATA?.userId as string));

  // TODO: Delete the test event
});

describe("/v1/events", () => {
  /**
   * Test whether we can receive a list of events sent
   */
  test.todo("GET /", async () => {
    const response = await events.request("/", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // TODO: Use a test API key
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    // Assert that we have a successful response
    expect(response.status).toBe(200);

    const { data } = (await response.json()) as any;

    // Assert that we have at least one event
    expect(data?.events?.length).toBeGreaterThan(0);
  });

  /**
   * Test whether we can receive a specific event by its ID
   */
  test.todo("GET /:id", async () => {
    // TODO: Use a valid event ID
    const response = await events.request("/:id", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // TODO: Use a test API key
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    // Assert that we have a successful response
    expect(response.status).toBe(200);

    const { data } = (await response.json()) as any;

    // Assert that we have a valid event
    expect(data?.event).toBeObject();

    // Assert whether the event contains the encrypted payload
    expect(data?.event?.encrypted_payload).toBeObject();

    // Now try to decrypt the encrypted payload using the private key from the secrets directory
    const privateKey = await file(
      new URL("../../../secrets/rsa_private.pem", import.meta.url)
    ).text();
    const encryptedPayload = data?.event?.encrypted_payload;
    const decryptedPayload = await compactDecrypt(
      encryptedPayload,
      await importPKCS8(privateKey, "RSA-OAEP-256")
    );
    expect(decryptedPayload).toBeString();
  });

  /**
   * Test whether we can replay a specific event
   *
   * @note This test does not check the status of the replay — only that the API is successfully called.
   */
  test.todo("POST /:id/replay", async () => {
    // TODO: Use a valid event ID
    const response = await events.request("/:id/replay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // TODO: Use a test API key
        Authorization: `Bearer ${TEST_DATA?.apiKey}`,
      },
    });

    // Assert that we have a successful response (202 Accepted)
    expect(response.status).toBe(202);
  });
});
