import { expect, test } from "bun:test";
import { createHMAC } from "@/functions/hmac";

/**
 * Test whether we can create a HMAC
 */
test("createHMAC", async () => {
  const payload = {
    name: "John Doe",
    email: "john.doe@example.com",
  };

  const timestamp = new Date("2025-11-26T18:00:00.000Z").getTime().toString();

  const hmac = await createHMAC(`${timestamp}.${JSON.stringify(payload)}`, {
    secret: "secret",
    algorithm: "SHA256",
  });

  expect(hmac).toBeString();

  // The payload was created in the format of `timestamp.payload`
  expect(hmac).toBe(
    "631a0bfeb29ef73049d328d97d3931f39e412104d5775502329732dfd20d766b"
  );
});
