import { describe, expect, test } from "bun:test";
import {
  extractDg2FaceImage,
  validateAuthenticity,
} from "@/v1/verify/validation";
import {
  createDg2Artifact,
  createMalformedDg2Artifact,
  createSodArtifact,
  createValidNfcArtifacts,
  loadVerifyFixtureBytes,
} from "../helpers/verify-artifacts";

function wrapSodAsEfSod(contentInfo: Uint8Array): Uint8Array {
  const length = contentInfo.length;

  if (length < 0x80) {
    return Uint8Array.from([0x77, length, ...contentInfo]);
  }

  const lengthBytes: number[] = [];
  let remaining = length;

  while (remaining > 0) {
    lengthBytes.unshift(remaining % 0x1_00);
    remaining = Math.floor(remaining / 0x1_00);
  }

  return Uint8Array.from([
    0x77,
    0x80 + lengthBytes.length,
    ...lengthBytes,
    ...contentInfo,
  ]);
}

describe("verify validation engine", () => {
  test("passes authenticity when CMS SOD hash values match DG1 and DG2", async () => {
    const artifacts = await createValidNfcArtifacts();

    const result = await validateAuthenticity(artifacts);

    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.algorithm).toBe("SHA-256");
      expect(result.source).toBe("cms_signed_data");
    }
  });

  test("fails authenticity on digest mismatch", async () => {
    const dg1 = new TextEncoder().encode(
      "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<"
    );
    const dg2 = createDg2Artifact({
      imageData: await loadVerifyFixtureBytes("icon.jpg"),
      imageFormat: "jpeg",
    });
    const sod = await createSodArtifact({
      dg1,
      dg2,
      dg1HashOverride: new Uint8Array(32).fill(0),
      dg2HashOverride: new Uint8Array(32).fill(0),
    });

    const result = await validateAuthenticity({
      dg1,
      dg2,
      sod,
    });

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.reason).toBe("dg_hash_mismatch");
    }
  });

  test("fails authenticity when DG2 hash is missing from the security object", async () => {
    const dg1 = new TextEncoder().encode(
      "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<"
    );
    const dg2 = createDg2Artifact({
      imageData: await loadVerifyFixtureBytes("icon.jpg"),
      imageFormat: "jpeg",
    });
    const sod = await createSodArtifact({
      dg1,
      dg2,
      includeDg2Hash: false,
    });

    const result = await validateAuthenticity({
      dg1,
      dg2,
      sod,
    });

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.reason).toBe("required_dg_hash_missing");
    }
  });

  test("fails authenticity on malformed SOD payloads", async () => {
    const result = await validateAuthenticity({
      dg1: new Uint8Array([0x01, 0x02]),
      dg2: new Uint8Array([0x03, 0x04]),
      sod: new Uint8Array([0x00, 0x01, 0x02]),
    });

    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.reason).toBe("sod_parse_failed");
    }
  });

  test("passes authenticity when SOD is wrapped as EF.SOD data group bytes", async () => {
    const artifacts = await createValidNfcArtifacts();

    const result = await validateAuthenticity({
      ...artifacts,
      sod: wrapSodAsEfSod(artifacts.sod),
    });

    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.algorithm).toBe("SHA-256");
      expect(result.source).toBe("cms_signed_data");
    }
  });

  test("extracts a JPEG portrait image from DG2", async () => {
    const jpegBytes = await loadVerifyFixtureBytes("icon.jpg");
    const dg2 = createDg2Artifact({
      imageData: jpegBytes,
      imageFormat: "jpeg",
    });

    const result = extractDg2FaceImage(dg2);

    expect(result.imageFormat).toBe("jpeg");
    expect(result.imageWidth).toBe(32);
    expect(result.imageHeight).toBe(32);
    expect(result.imageData.length).toBe(jpegBytes.length);
  });

  test("extracts a JPEG2000 portrait image from DG2", async () => {
    const jp2Bytes = await loadVerifyFixtureBytes("icon.jp2");
    const dg2 = createDg2Artifact({
      imageData: jp2Bytes,
      imageFormat: "jpeg2000",
    });

    const result = extractDg2FaceImage(dg2);

    expect(result.imageFormat).toBe("jpeg2000");
    expect(result.imageWidth).toBe(32);
    expect(result.imageHeight).toBe(32);
    expect(result.imageData.length).toBe(jp2Bytes.length);
  });

  test("extracts a JPEG portrait image from EF.DG2-wrapped payloads", async () => {
    const jpegBytes = await loadVerifyFixtureBytes("icon.jpg");
    const dg2 = createDg2Artifact({
      imageData: jpegBytes,
      imageFormat: "jpeg",
      wrapWithEfTag: true,
    });

    const result = extractDg2FaceImage(dg2);

    expect(result.imageFormat).toBe("jpeg");
    expect(result.imageWidth).toBe(32);
    expect(result.imageHeight).toBe(32);
    expect(result.imageData.length).toBe(jpegBytes.length);
  });

  test("rejects malformed DG2 payloads", () => {
    expect(() => extractDg2FaceImage(createMalformedDg2Artifact())).toThrow();
  });
});
