import { expect, test } from "bun:test";
import { file } from "bun";
import { compactDecrypt, importPKCS8 } from "jose";
import { createJWE } from "@/functions/jwe";

/**
 * Test whether we can create a JWE
 */
test("createJWE", async () => {
  const payload = "Hello, world!";
  const jwe = await createJWE(payload, {
    publicKey: await file(
      new URL("../../../../secrets/rsa_public.pem", import.meta.url)
    ).text(),
  });
  expect(jwe).toBeString();

  // Decrypt the JWE using the private key
  const privateKey = await file(
    new URL("../../../../secrets/rsa_private.pem", import.meta.url)
  ).text();

  const { plaintext, protectedHeader } = await compactDecrypt(
    jwe,
    await importPKCS8(privateKey, "RSA-OAEP-256")
  );

  // Assert header is what we expect
  expect(protectedHeader.alg).toBe("RSA-OAEP-256");
  expect(protectedHeader.enc).toBe("A256GCM");

  // Assert we can correctly decode the plaintext back to the original payload
  const decoded = new TextDecoder().decode(plaintext);
  expect(decoded).toBe(payload);
});
