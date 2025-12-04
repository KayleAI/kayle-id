export function generateRandomString(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const randomBytes = new Uint8Array(length);

  crypto.getRandomValues(randomBytes);

  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += alphabet[randomBytes[i] % alphabet.length];
  }

  return result;
}

/**
 * Generate a random unique ID.
 *
 * @returns {string} The generated ID.
 */
export function generateId({
  type,
  environment,
  length = 48,
}: {
  /**
   * The type of ID to generate. For example, vs, whk, va, etc
   */
  type: string;
  /**
   * The environment to generate the ID for. For example, live or test.
   */
  environment: "live" | "test";
  /**
   * The length of the ID to generate. For example, 32 for a 32 character ID.
   */
  length?: number;
}): string {
  return `${type}_${environment}_${generateRandomString(length)}`;
}
