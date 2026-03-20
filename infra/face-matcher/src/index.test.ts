import { expect, test } from "bun:test";
import {
  createFaceMatcherRequestFormData,
  FACE_MATCHER_AUTH_HEADER,
} from "@kayle-id/config/face-matcher";
import {
  createDg2Artifact,
  loadVerifyFixtureBytes,
} from "../../../apps/api/tests/helpers/verify-artifacts";
import { createFaceMatcherWorker } from "./worker";

function createExecutionContext(): ExecutionContext {
  return {
    passThroughOnException() {
      return;
    },
    waitUntil() {
      return;
    },
  } as unknown as ExecutionContext;
}

test("face matcher worker returns a passing score for valid inputs", async () => {
  const portrait = await loadVerifyFixtureBytes("icon.jpg");
  const dg2 = createDg2Artifact({
    imageData: portrait,
    imageFormat: "jpeg",
    wrapWithEfTag: true,
  });
  let capturedPathname: string | null = null;
  let capturedPayload: unknown = null;

  const worker = createFaceMatcherWorker({
    getContainer: async () => ({
      fetch: async (input, init) => {
        const request = new Request(input, init);
        capturedPathname = new URL(request.url).pathname;
        capturedPayload = await request.json();

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
    }),
  });

  const response = await worker.fetch(
    new Request("http://face-matcher/match", {
      body: createFaceMatcherRequestFormData({
        dg2Image: dg2,
        selfies: [portrait],
      }),
      headers: {
        [FACE_MATCHER_AUTH_HEADER]: "test-secret",
      },
      method: "POST",
    }) as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>,
    {
      FACE_MATCHER_SECRET: "test-secret",
    } as unknown as FaceMatcherBindings,
    createExecutionContext()
  );

  expect(response.status).toBe(200);
  const matcherPathname = capturedPathname;

  if (matcherPathname === null) {
    throw new Error("Expected matcher container pathname to be captured");
  }
  if (matcherPathname !== "/match") {
    throw new Error(
      `Expected matcher path to be /match, got ${matcherPathname}`
    );
  }
  expect(capturedPayload).toEqual(
    expect.objectContaining({
      dg2Image: expect.objectContaining({
        height: expect.any(Number),
        rgbaBase64: expect.any(String),
        width: expect.any(Number),
      }),
      selfiesBase64: [expect.any(String)],
    })
  );
  const payload = (await response.json()) as Record<string, unknown>;
  expect(payload).toEqual({
    faceScore: 0.91,
    passed: true,
    usedFallback: false,
  });
});

test("face matcher worker rejects malformed requests", async () => {
  const worker = createFaceMatcherWorker();
  const formData = new FormData();
  formData.append("threshold", "bad");

  const response = await worker.fetch(
    new Request("http://face-matcher/match", {
      body: formData,
      method: "POST",
    }) as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>,
    {} as unknown as FaceMatcherBindings,
    createExecutionContext()
  );

  expect(response.status).toBe(400);
});

test("face matcher worker rejects unauthorized requests", async () => {
  const portrait = await loadVerifyFixtureBytes("icon.jpg");
  const worker = createFaceMatcherWorker({
    getContainer: async () => ({
      fetch: async () =>
        new Response(
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
        ),
    }),
  });

  const response = await worker.fetch(
    new Request("http://face-matcher/match", {
      body: createFaceMatcherRequestFormData({
        dg2Image: createDg2Artifact({
          imageData: portrait,
          imageFormat: "jpeg",
        }),
        selfies: [portrait],
      }),
      headers: {
        [FACE_MATCHER_AUTH_HEADER]: "wrong-secret",
      },
      method: "POST",
    }) as unknown as Request<unknown, IncomingRequestCfProperties<unknown>>,
    {
      FACE_MATCHER_SECRET: "test-secret",
    } as unknown as FaceMatcherBindings,
    createExecutionContext()
  );

  expect(response.status).toBe(401);
});
