import { expect, test } from "bun:test";
import { generateId } from "@/utils/generate-id";

const ID_REGEX = /^vs_test_[A-Za-z0-9]{64}$/;

/**
 * Test whether we can generate a random ID
 */
test("generateId", () => {
  const id = generateId({
    type: "vs",
    environment: "test",
  });
  expect(id).toBeString();
  expect(id).toMatch(ID_REGEX);
});
