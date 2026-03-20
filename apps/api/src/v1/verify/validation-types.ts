export type SupportedHashAlgorithm =
  | "SHA-256"
  | "SHA-384"
  | "SHA-512"
  | "SHA-1";

export type SupportedImageFormat = "jpeg" | "jpeg2000";

export type DecodedImage = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

export type Dg2FaceImage = {
  imageData: Uint8Array;
  imageFormat: SupportedImageFormat;
  imageWidth: number;
  imageHeight: number;
};

export const DEFAULT_FACE_MATCH_THRESHOLD = 0.8;

export type AuthenticityValidationResult =
  | {
      ok: true;
      algorithm: SupportedHashAlgorithm;
      source: "cms_signed_data";
    }
  | {
      ok: false;
      reason: string;
    };

export type FaceScoreResult = {
  faceScore: number | null;
  passed: boolean;
  usedFallback: boolean;
  reason?: string;
};
