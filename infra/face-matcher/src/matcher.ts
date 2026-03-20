import { faceMatcherResponseSchema } from "@kayle-id/config/face-matcher";
import {
  decodeFaceImageBytes,
  extractDg2FaceImage,
} from "../../../apps/api/src/v1/verify/validation";
import type {
  DecodedImage,
  Dg2FaceImage,
  FaceScoreResult,
} from "../../../apps/api/src/v1/verify/validation-types";

type ContainerMatchRequestPayload = {
  dg2Image: {
    height: number;
    rgbaBase64: string;
    width: number;
  };
  selfiesBase64: string[];
  threshold?: number;
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
type ContainerFetcher = {
  fetch: FetchLike;
};

function createUnavailableFaceScore(reason: string): FaceScoreResult {
  return {
    faceScore: null,
    passed: false,
    reason,
    usedFallback: true,
  };
}

async function requestContainerMatch({
  container,
  payload,
}: {
  container: ContainerFetcher;
  payload: ContainerMatchRequestPayload;
}): Promise<FaceScoreResult> {
  try {
    const response = await container.fetch("http://container/match", {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      return createUnavailableFaceScore(
        `face_matcher_unavailable:container_http_${response.status}`
      );
    }

    const json = await response.json().catch(() => null);

    if (json === null) {
      return createUnavailableFaceScore(
        "face_matcher_unavailable:container_invalid_json"
      );
    }

    const parsedResponse = faceMatcherResponseSchema.safeParse(json);

    if (!parsedResponse.success) {
      return createUnavailableFaceScore(
        "face_matcher_unavailable:container_invalid_response"
      );
    }

    return {
      faceScore: parsedResponse.data.faceScore,
      passed: parsedResponse.data.passed,
      reason: parsedResponse.data.reason,
      usedFallback: parsedResponse.data.usedFallback,
    };
  } catch (error) {
    return createUnavailableFaceScore(
      `face_matcher_unavailable:${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function matchFacesWithContainer({
  container,
  dg2Image,
  selfies,
  threshold,
}: {
  container: ContainerFetcher;
  dg2Image: Uint8Array;
  selfies: Uint8Array[];
  threshold?: number;
}): Promise<FaceScoreResult> {
  if (selfies.length === 0) {
    return createUnavailableFaceScore("face_score_input_missing");
  }

  let dg2FaceImage: Dg2FaceImage;

  try {
    dg2FaceImage = extractDg2FaceImage(dg2Image);
  } catch (error) {
    return createUnavailableFaceScore(
      `face_score_dg2_extract_failed:${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  let decodedFaceImage: DecodedImage;

  try {
    decodedFaceImage = await decodeFaceImageBytes(dg2FaceImage.imageData);
  } catch (error) {
    return createUnavailableFaceScore(
      `face_score_dg2_decode_failed:${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return requestContainerMatch({
    container,
    payload: {
      dg2Image: {
        height: decodedFaceImage.height,
        rgbaBase64: Buffer.from(decodedFaceImage.rgba).toString("base64"),
        width: decodedFaceImage.width,
      },
      selfiesBase64: selfies.map((selfie) =>
        Buffer.from(selfie).toString("base64")
      ),
      threshold,
    },
  });
}
