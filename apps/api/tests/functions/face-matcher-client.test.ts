import { afterEach, expect, mock, test } from "bun:test";
import {
  FACE_MATCHER_AUTH_HEADER,
  FACE_MATCHER_DG2_FIELD,
} from "@kayle-id/config/face-matcher";
import { matchFaces } from "@/v1/verify/face-matcher-client";

const originalFetch = globalThis.fetch;

function requireCapturedValue(value: string | null, label: string): string {
  if (value === null) {
    throw new Error(`Expected ${label} to be captured`);
  }

  return value;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

test("matchFaces uses the face matcher HTTP contract", async () => {
  let capturedThisValue: unknown = null;
  let capturedUrl: string | null = null;
  let capturedAuthHeader: string | null = null;
  let capturedDg2Size = 0;
  const capturedSelfies: number[] = [];
  let capturedThreshold: string | null = null;

  const matcherBinding = {
    async fetch(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input, init);
      const formData = await request.formData();

      capturedThisValue = this;
      capturedUrl = request.url;
      capturedAuthHeader = request.headers.get(FACE_MATCHER_AUTH_HEADER);
      capturedThreshold = formData.get("threshold") as string | null;
      capturedDg2Size = (
        await (formData.get(FACE_MATCHER_DG2_FIELD) as Blob).arrayBuffer()
      ).byteLength;

      for (const [fieldName, value] of formData.entries()) {
        if (!fieldName.startsWith("selfie_")) {
          continue;
        }

        capturedSelfies.push((await (value as Blob).arrayBuffer()).byteLength);
      }

      return new Response(
        JSON.stringify({
          faceScore: 0.91,
          passed: true,
          usedFallback: false,
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }
      );
    },
  };

  const result = await matchFaces({
    dg2Image: new Uint8Array([0x01, 0x02, 0x03]),
    env: {
      FACE_MATCHER: matcherBinding,
      FACE_MATCHER_SECRET: "test-secret",
    },
    selfies: [new Uint8Array([0x04, 0x05, 0x06]), new Uint8Array([0x07, 0x08])],
    threshold: 0.8,
  });

  expect(result).toEqual({
    faceScore: 0.91,
    passed: true,
    usedFallback: false,
  });
  expect(requireCapturedValue(capturedUrl, "face matcher request URL")).toBe(
    "https://face-matcher.internal/match"
  );
  if (capturedThisValue !== matcherBinding) {
    throw new Error(
      "Expected face matcher binding fetch to retain its receiver"
    );
  }
  expect(
    requireCapturedValue(capturedAuthHeader, "face matcher auth header")
  ).toBe("test-secret");
  expect(
    requireCapturedValue(capturedThreshold, "face matcher threshold")
  ).toBe("0.8");
  expect(capturedDg2Size).toBe(3);
  expect(capturedSelfies).toEqual([3, 2]);
});

test("matchFaces fails closed when matcher config is unavailable", async () => {
  const result = await matchFaces({
    dg2Image: new Uint8Array([0x01, 0x02, 0x03]),
    env: {},
    selfies: [new Uint8Array([0x04, 0x05, 0x06])],
  });

  expect(result).toEqual({
    faceScore: null,
    passed: false,
    reason: "face_matcher_unavailable",
    usedFallback: true,
  });
});

test("matchFaces does not require a matcher secret when the binding is available", async () => {
  let capturedAuthHeader: string | null = "not-set";

  const matcherBinding = {
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input, init);
      capturedAuthHeader = request.headers.get(FACE_MATCHER_AUTH_HEADER);

      return new Response(
        JSON.stringify({
          faceScore: 0.87,
          passed: true,
          usedFallback: false,
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }
      );
    },
  };

  const result = await matchFaces({
    dg2Image: new Uint8Array([0x01, 0x02, 0x03]),
    env: {
      FACE_MATCHER: matcherBinding,
    },
    selfies: [new Uint8Array([0x04, 0x05, 0x06])],
  });

  expect(result).toEqual({
    faceScore: 0.87,
    passed: true,
    usedFallback: false,
  });
  expect(capturedAuthHeader).toBeNull();
});

test("matchFaces fails closed when the matcher returns invalid JSON", async () => {
  globalThis.fetch = mock(
    async () =>
      new Response("not-json", {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      })
  ) as unknown as typeof fetch;

  const result = await matchFaces({
    dg2Image: new Uint8Array([0x01]),
    env: {
      FACE_MATCHER: {
        fetch: globalThis.fetch,
      },
      FACE_MATCHER_SECRET: "test-secret",
    },
    selfies: [new Uint8Array([0x02])],
  });

  expect(result).toEqual({
    faceScore: null,
    passed: false,
    reason: "face_matcher_unavailable",
    usedFallback: true,
  });
});
