import {
  decodeFaceImageBytes as decodeFaceImageBytesInternal,
  extractDg2FaceImage as extractDg2FaceImageInternal,
} from "./dg2-face-image";
import { validateAuthenticity as validateAuthenticityInternal } from "./sod-authenticity";
import type {
  AuthenticityValidationResult as AuthenticityValidationResultValue,
  DecodedImage,
  Dg2FaceImage as Dg2FaceImageValue,
} from "./validation-types";
import { configureVerifyAssetFetcher as configureVerifyAssetFetcherInternal } from "./verify-assets";

export type AuthenticityValidationResult = AuthenticityValidationResultValue;
export type Dg2FaceImage = Dg2FaceImageValue;

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
