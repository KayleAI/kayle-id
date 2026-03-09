import { decodeFaceImageBytes, extractDg2FaceImage } from "./dg2-face-image";
import {
  DEFAULT_FACE_MATCH_THRESHOLD,
  type DecodedImage,
  type FaceScoreResult,
} from "./validation-types";

const MODEL_INPUT_SIZE = 112;
const RGB_CHANNELS = 3;
const RGBA_CHANNELS = 4;
const FACE_PATCH_GRID_SIZE = 16;
const FACE_PATCH_SIZE = MODEL_INPUT_SIZE / FACE_PATCH_GRID_SIZE;
const FACE_GRADIENT_GRID_SIZE = 8;
const FACE_GRADIENT_CELL_SIZE = MODEL_INPUT_SIZE / FACE_GRADIENT_GRID_SIZE;
const FACE_HISTOGRAM_BINS = 16;
const FACE_HISTOGRAM_BASELINE = 1 / FACE_HISTOGRAM_BINS;
const FACE_PATCH_WEIGHT = 0.6;
const FACE_GRADIENT_WEIGHT = 0.25;
const FACE_HISTOGRAM_WEIGHT = 0.1;
const FACE_STATS_WEIGHT = 0.05;

type EmbeddingVector = {
  isZero: boolean;
  values: Float32Array;
};

type FaceEmbedding = {
  gradient: EmbeddingVector;
  histogram: EmbeddingVector;
  patch: EmbeddingVector;
  stats: EmbeddingVector;
};

function clampScore(score: number): number {
  if (Number.isNaN(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function clampCoordinate(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

function rgbaIndex(image: DecodedImage, x: number, y: number): number {
  return (y * image.width + x) * RGBA_CHANNELS;
}

function sampleRgbaChannel(
  image: DecodedImage,
  x: number,
  y: number,
  channel: number
): number {
  const clampedX = clampCoordinate(x, image.width - 1);
  const clampedY = clampCoordinate(y, image.height - 1);
  return image.rgba[rgbaIndex(image, clampedX, clampedY) + channel];
}

function bilinearSample(
  image: DecodedImage,
  x: number,
  y: number,
  channel: number
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, image.width - 1);
  const y1 = Math.min(y0 + 1, image.height - 1);
  const xWeight = x - x0;
  const yWeight = y - y0;

  const topLeft = sampleRgbaChannel(image, x0, y0, channel);
  const topRight = sampleRgbaChannel(image, x1, y0, channel);
  const bottomLeft = sampleRgbaChannel(image, x0, y1, channel);
  const bottomRight = sampleRgbaChannel(image, x1, y1, channel);

  const top = topLeft + (topRight - topLeft) * xWeight;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * xWeight;

  return top + (bottom - top) * yWeight;
}

function buildModelInput(image: DecodedImage): Float32Array {
  const cropSize = Math.min(image.width, image.height);
  const offsetX = (image.width - cropSize) / 2;
  const offsetY = (image.height - cropSize) / 2;
  const output = new Float32Array(
    MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * RGB_CHANNELS
  );
  const channelArea = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;

  for (let y = 0; y < MODEL_INPUT_SIZE; y += 1) {
    for (let x = 0; x < MODEL_INPUT_SIZE; x += 1) {
      const sourceX = offsetX + ((x + 0.5) * cropSize) / MODEL_INPUT_SIZE - 0.5;
      const sourceY = offsetY + ((y + 0.5) * cropSize) / MODEL_INPUT_SIZE - 0.5;
      const destinationIndex = y * MODEL_INPUT_SIZE + x;

      output[destinationIndex] =
        (bilinearSample(image, sourceX, sourceY, 0) - 127.5) / 127.5;
      output[channelArea + destinationIndex] =
        (bilinearSample(image, sourceX, sourceY, 1) - 127.5) / 127.5;
      output[channelArea * 2 + destinationIndex] =
        (bilinearSample(image, sourceX, sourceY, 2) - 127.5) / 127.5;
    }
  }

  return output;
}

function buildGrayscalePlane(modelInput: Float32Array): Float32Array {
  const channelArea = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const grayscale = new Float32Array(channelArea);

  for (let index = 0; index < channelArea; index += 1) {
    grayscale[index] =
      (modelInput[index] +
        modelInput[channelArea + index] +
        modelInput[channelArea * 2 + index]) /
      RGB_CHANNELS;
  }

  return grayscale;
}

function finalizeEmbeddingVector(values: Float32Array): EmbeddingVector {
  let squaredSum = 0;

  for (const value of values) {
    squaredSum += value * value;
  }

  const magnitude = Math.sqrt(squaredSum);

  if (!(magnitude > 0)) {
    return {
      isZero: true,
      values: new Float32Array(values.length),
    };
  }

  const normalized = new Float32Array(values.length);

  for (let index = 0; index < values.length; index += 1) {
    normalized[index] = values[index] / magnitude;
  }

  return {
    isZero: false,
    values: normalized,
  };
}

function componentSimilarity(
  left: EmbeddingVector,
  right: EmbeddingVector
): number {
  if (left.values.length !== right.values.length || left.values.length === 0) {
    throw new Error("embedding_shape_mismatch");
  }

  if (left.isZero && right.isZero) {
    return 1;
  }

  if (left.isZero || right.isZero) {
    return 0;
  }

  let score = 0;

  for (let index = 0; index < left.values.length; index += 1) {
    score += left.values[index] * right.values[index];
  }

  return clampScore(score);
}

function buildPatchEmbedding(grayscale: Float32Array): EmbeddingVector {
  const patchValues = new Float32Array(FACE_PATCH_GRID_SIZE ** 2);
  let grayscaleSum = 0;

  for (const value of grayscale) {
    grayscaleSum += value;
  }

  const grayscaleMean = grayscaleSum / grayscale.length;

  for (let patchY = 0; patchY < FACE_PATCH_GRID_SIZE; patchY += 1) {
    for (let patchX = 0; patchX < FACE_PATCH_GRID_SIZE; patchX += 1) {
      let patchSum = 0;

      for (let localY = 0; localY < FACE_PATCH_SIZE; localY += 1) {
        const sourceY = patchY * FACE_PATCH_SIZE + localY;

        for (let localX = 0; localX < FACE_PATCH_SIZE; localX += 1) {
          const sourceX = patchX * FACE_PATCH_SIZE + localX;
          patchSum += grayscale[sourceY * MODEL_INPUT_SIZE + sourceX];
        }
      }

      const patchIndex = patchY * FACE_PATCH_GRID_SIZE + patchX;
      patchValues[patchIndex] =
        patchSum / (FACE_PATCH_SIZE * FACE_PATCH_SIZE) - grayscaleMean;
    }
  }

  return finalizeEmbeddingVector(patchValues);
}

function averageGradientForCell(
  grayscale: Float32Array,
  startX: number,
  startY: number
): {
  dx: number;
  dy: number;
} {
  const endX = startX + FACE_GRADIENT_CELL_SIZE;
  const endY = startY + FACE_GRADIENT_CELL_SIZE;
  let dxSum = 0;
  let dySum = 0;
  let samples = 0;

  for (
    let y = Math.max(1, startY);
    y < Math.min(endY, MODEL_INPUT_SIZE - 1);
    y += 1
  ) {
    for (
      let x = Math.max(1, startX);
      x < Math.min(endX, MODEL_INPUT_SIZE - 1);
      x += 1
    ) {
      const index = y * MODEL_INPUT_SIZE + x;
      dxSum += grayscale[index + 1] - grayscale[index - 1];
      dySum +=
        grayscale[index + MODEL_INPUT_SIZE] -
        grayscale[index - MODEL_INPUT_SIZE];
      samples += 1;
    }
  }

  return {
    dx: samples > 0 ? dxSum / samples : 0,
    dy: samples > 0 ? dySum / samples : 0,
  };
}

function buildGradientEmbedding(grayscale: Float32Array): EmbeddingVector {
  const gradientValues = new Float32Array(FACE_GRADIENT_GRID_SIZE ** 2 * 2);

  for (let cellY = 0; cellY < FACE_GRADIENT_GRID_SIZE; cellY += 1) {
    for (let cellX = 0; cellX < FACE_GRADIENT_GRID_SIZE; cellX += 1) {
      const startX = cellX * FACE_GRADIENT_CELL_SIZE;
      const startY = cellY * FACE_GRADIENT_CELL_SIZE;
      const { dx, dy } = averageGradientForCell(grayscale, startX, startY);
      const targetIndex = (cellY * FACE_GRADIENT_GRID_SIZE + cellX) * 2;
      gradientValues[targetIndex] = dx;
      gradientValues[targetIndex + 1] = dy;
    }
  }

  return finalizeEmbeddingVector(gradientValues);
}

function buildHistogramEmbedding(grayscale: Float32Array): EmbeddingVector {
  const histogramValues = new Float32Array(FACE_HISTOGRAM_BINS);

  for (const value of grayscale) {
    const normalizedValue = Math.max(0, Math.min(0.999_999, (value + 1) / 2));
    const binIndex = Math.floor(normalizedValue * FACE_HISTOGRAM_BINS);
    histogramValues[binIndex] += 1;
  }

  for (let index = 0; index < histogramValues.length; index += 1) {
    histogramValues[index] =
      histogramValues[index] / grayscale.length - FACE_HISTOGRAM_BASELINE;
  }

  return finalizeEmbeddingVector(histogramValues);
}

function buildStatsEmbedding(
  modelInput: Float32Array,
  grayscale: Float32Array
): EmbeddingVector {
  const channelArea = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const statsValues = new Float32Array(8);
  let grayscaleSum = 0;
  let grayscaleSquaredSum = 0;

  for (let channel = 0; channel < RGB_CHANNELS; channel += 1) {
    const channelOffset = channel * channelArea;
    let sum = 0;
    let squaredSum = 0;

    for (let index = 0; index < channelArea; index += 1) {
      const value = modelInput[channelOffset + index];
      sum += value;
      squaredSum += value * value;
    }

    const mean = sum / channelArea;
    const variance = Math.max(0, squaredSum / channelArea - mean * mean);
    statsValues[channel] = mean;
    statsValues[RGB_CHANNELS + channel] = Math.sqrt(variance);
  }

  for (const value of grayscale) {
    grayscaleSum += value;
    grayscaleSquaredSum += value * value;
  }

  const grayscaleMean = grayscaleSum / grayscale.length;
  const grayscaleVariance = Math.max(
    0,
    grayscaleSquaredSum / grayscale.length - grayscaleMean * grayscaleMean
  );
  statsValues[6] = grayscaleMean;
  statsValues[7] = Math.sqrt(grayscaleVariance);

  return finalizeEmbeddingVector(statsValues);
}

function computeFaceEmbedding(image: DecodedImage): FaceEmbedding {
  const modelInput = buildModelInput(image);
  const grayscale = buildGrayscalePlane(modelInput);

  return {
    gradient: buildGradientEmbedding(grayscale),
    histogram: buildHistogramEmbedding(grayscale),
    patch: buildPatchEmbedding(grayscale),
    stats: buildStatsEmbedding(modelInput, grayscale),
  };
}

function computeFaceEmbeddingSimilarity(
  left: FaceEmbedding,
  right: FaceEmbedding
): number {
  return clampScore(
    componentSimilarity(left.patch, right.patch) * FACE_PATCH_WEIGHT +
      componentSimilarity(left.gradient, right.gradient) *
        FACE_GRADIENT_WEIGHT +
      componentSimilarity(left.histogram, right.histogram) *
        FACE_HISTOGRAM_WEIGHT +
      componentSimilarity(left.stats, right.stats) * FACE_STATS_WEIGHT
  );
}

function fallbackFaceScore(reason: string): FaceScoreResult {
  return {
    faceScore: null,
    passed: true,
    usedFallback: true,
    reason,
  };
}

export function evaluateFaceMatch({
  faceScore,
  threshold = DEFAULT_FACE_MATCH_THRESHOLD,
}: {
  faceScore: number;
  threshold?: number;
}): FaceScoreResult {
  const normalizedScore = clampScore(faceScore);

  return {
    faceScore: normalizedScore,
    passed: normalizedScore >= threshold,
    usedFallback: false,
  };
}

export async function computeFaceScore({
  dg2Image,
  selfies,
  threshold = DEFAULT_FACE_MATCH_THRESHOLD,
}: {
  dg2Image: Uint8Array;
  selfies: Uint8Array[];
  threshold?: number;
}): Promise<FaceScoreResult> {
  const validSelfies = selfies.filter((selfie) => selfie.length > 0);

  if (!(dg2Image.length && validSelfies.length > 0)) {
    return fallbackFaceScore("face_score_unavailable");
  }

  try {
    const passportFace = extractDg2FaceImage(dg2Image);
    const passportEmbedding = computeFaceEmbedding(
      await decodeFaceImageBytes(passportFace.imageData)
    );
    const scores: number[] = [];

    for (const selfie of validSelfies) {
      try {
        const selfieEmbedding = computeFaceEmbedding(
          await decodeFaceImageBytes(selfie)
        );
        scores.push(
          computeFaceEmbeddingSimilarity(passportEmbedding, selfieEmbedding)
        );
      } catch {
        // Ignore individual selfie decode failures and fall back only when none
        // of the supplied selfies can be scored.
      }
    }

    if (scores.length === 0) {
      return fallbackFaceScore("face_score_unavailable");
    }

    const maxScore = scores.reduce(
      (currentMax, current) => (current > currentMax ? current : currentMax),
      0
    );

    return evaluateFaceMatch({
      faceScore: maxScore,
      threshold,
    });
  } catch {
    return fallbackFaceScore("face_score_unavailable");
  }
}
