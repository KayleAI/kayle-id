import {
  decodeFaceImageBytes as decodeFaceImageBytesInternal,
  extractDg2FaceImage as extractDg2FaceImageInternal,
} from "./dg2-face-image";
import {
  computeFaceScore as computeFaceScoreInternal,
  evaluateFaceMatch as evaluateFaceMatchInternal,
} from "./face-score";
import { validateAuthenticity as validateAuthenticityInternal } from "./sod-authenticity";
import {
  type AuthenticityValidationResult as AuthenticityValidationResultValue,
  type DecodedImage,
  type Dg2FaceImage as Dg2FaceImageValue,
  DEFAULT_FACE_MATCH_THRESHOLD as defaultFaceMatchThreshold,
  type FaceScoreResult as FaceScoreResultValue,
} from "./validation-types";
import { configureVerifyAssetFetcher as configureVerifyAssetFetcherInternal } from "./verify-assets";

export const DEFAULT_FACE_MATCH_THRESHOLD = defaultFaceMatchThreshold;

export type AuthenticityValidationResult = AuthenticityValidationResultValue;
export type Dg2FaceImage = Dg2FaceImageValue;
export type FaceScoreResult = FaceScoreResultValue;

export function configureVerifyAssetFetcher(
  fetcher: ((pathname: string) => Promise<Uint8Array>) | null
): void {
  configureVerifyAssetFetcherInternal(fetcher);
}

export function extractDg2FaceImage(dg2: Uint8Array): Dg2FaceImage {
  return extractDg2FaceImageInternal(dg2);
}

export function decodeFaceImageBytes(bytes: Uint8Array): Promise<DecodedImage> {
  return decodeFaceImageBytesInternal(bytes);
}

export function evaluateFaceMatch({
  faceScore,
  threshold = DEFAULT_FACE_MATCH_THRESHOLD,
}: {
  faceScore: number;
  threshold?: number;
}): FaceScoreResult {
  return evaluateFaceMatchInternal({
    faceScore,
    threshold,
  });
}

export function validateAuthenticity({
  dg1,
  dg2,
  sod,
}: {
  dg1: Uint8Array;
  dg2: Uint8Array;
  sod: Uint8Array;
}): Promise<AuthenticityValidationResultValue> {
  return validateAuthenticityInternal({
    dg1,
    dg2,
    sod,
  });
}

export function computeFaceScore({
  dg2Image,
  selfies,
  threshold = DEFAULT_FACE_MATCH_THRESHOLD,
}: {
  dg2Image: Uint8Array;
  selfies: Uint8Array[];
  threshold?: number;
}): Promise<FaceScoreResultValue> {
  return computeFaceScoreInternal({
    dg2Image,
    selfies,
    threshold,
  });
}
