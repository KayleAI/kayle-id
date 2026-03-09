import { describe, expect, test } from "bun:test";
import {
  computeFaceScore,
  evaluateFaceMatch,
  extractDg2FaceImage,
  validateAuthenticity,
} from "@/v1/verify/validation";
import {
  createDg2Artifact,
  createLowSimilaritySelfies,
  createMalformedDg2Artifact,
  createSodArtifact,
  createValidNfcArtifacts,
  loadVerifyFixtureBytes,
} from "../helpers/verify-artifacts";

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

  test("rejects malformed DG2 payloads", () => {
    expect(() => extractDg2FaceImage(createMalformedDg2Artifact())).toThrow();
  });

  test("face score threshold checks remain deterministic at 0.79, 0.80 and 0.81", () => {
    const low = evaluateFaceMatch({
      faceScore: 0.79,
      threshold: 0.8,
    });
    const edge = evaluateFaceMatch({
      faceScore: 0.8,
      threshold: 0.8,
    });
    const high = evaluateFaceMatch({
      faceScore: 0.81,
      threshold: 0.8,
    });

    expect(low.faceScore).toBeCloseTo(0.79, 5);
    expect(low.passed).toBeFalse();
    expect(edge.faceScore).toBeCloseTo(0.8, 5);
    expect(edge.passed).toBeTrue();
    expect(high.faceScore).toBeCloseTo(0.81, 5);
    expect(high.passed).toBeTrue();
  });

  test("computes a passing face score for matching passport/selfie images", async () => {
    const iconJpeg = await loadVerifyFixtureBytes("icon.jpg");
    const dg2 = createDg2Artifact({
      imageData: iconJpeg,
      imageFormat: "jpeg",
    });

    const result = await computeFaceScore({
      dg2Image: dg2,
      selfies: [iconJpeg],
      threshold: 0.8,
    });

    expect(result.usedFallback).toBeFalse();
    expect(result.passed).toBeTrue();
    expect((result.faceScore ?? 0) > 0.95).toBeTrue();
  });

  test("computes a failing face score for mismatched selfies", async () => {
    const iconJpeg = await loadVerifyFixtureBytes("icon.jpg");
    const dg2 = createDg2Artifact({
      imageData: iconJpeg,
      imageFormat: "jpeg",
    });

    const result = await computeFaceScore({
      dg2Image: dg2,
      selfies: createLowSimilaritySelfies(),
      threshold: 0.8,
    });

    expect(result.usedFallback).toBeFalse();
    expect(result.passed).toBeFalse();
    expect((result.faceScore ?? 1) < 0.8).toBeTrue();
  });

  test("uses the max score across three selfies", async () => {
    const iconJpeg = await loadVerifyFixtureBytes("icon.jpg");
    const dg2 = createDg2Artifact({
      imageData: iconJpeg,
      imageFormat: "jpeg",
    });

    const result = await computeFaceScore({
      dg2Image: dg2,
      selfies: [...createLowSimilaritySelfies(), iconJpeg],
      threshold: 0.8,
    });

    expect(result.usedFallback).toBeFalse();
    expect(result.passed).toBeTrue();
    expect((result.faceScore ?? 0) > 0.95).toBeTrue();
  });

  test("face score fail-open is used when similarity cannot be computed", async () => {
    const result = await computeFaceScore({
      dg2Image: createMalformedDg2Artifact(),
      selfies: [new Uint8Array([0x00, 0x01, 0x02])],
      threshold: 0.8,
    });

    expect(result.usedFallback).toBeTrue();
    expect(result.passed).toBeTrue();
    expect(result.faceScore).toBeNull();
    expect(result.reason).toBe("face_score_unavailable");
  });
});
