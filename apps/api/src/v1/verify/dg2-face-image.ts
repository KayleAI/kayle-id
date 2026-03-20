import jpeg from "jpeg-js";
import type { DecodedImage, Dg2FaceImage } from "./validation-types";
import { loadOpenJpegWasmBinary } from "./verify-assets";

const FAC_HEADER = [0x46, 0x41, 0x43, 0x00] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const JPEG_2000_FILE_SIGNATURE = [
  0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
] as const;
const JPEG_2000_CODESTREAM_SIGNATURE = [0xff, 0x4f, 0xff, 0x51] as const;
const FEATURE_POINT_SIZE = 8;
const ONE_BYTE = 0x1_00;
const MULTI_BYTE_TAG_MASK = 0x20;
const MULTI_BYTE_TAG_SENTINEL = 0x1f;
const CONTINUATION_BYTE_MIN = 0x80;
const SHORT_LENGTH_MAX = 0x80;
const DG2_FILE_TAG = 0x75;
const DG2_ROOT_TAG = 0x7f_61;
const DG2_BIOMETRIC_GROUP_TAG = 0x7f_60;
const DG2_BIOMETRIC_DATA_TAG = 0x7f_2e;
const DG2_BIOMETRIC_DATA_ALT_TAG = 0x5f_2e;
const RGBA_CHANNELS = 4;

type TlvValue = {
  tag: number;
  value: Uint8Array;
  nextOffset: number;
};

type OpenJpegFactory =
  typeof import("@cornerstonejs/codec-openjpeg/decodewasmjs").default;

type OpenJpegModule = Awaited<ReturnType<OpenJpegFactory>>;

let openJpegPromise: Promise<OpenJpegModule> | null = null;

function startsWithBytes(
  bytes: Uint8Array,
  prefix: readonly number[]
): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

function readUint(bytes: Uint8Array, offset: number, length: number): number {
  if (offset < 0 || length <= 0 || offset + length > bytes.length) {
    throw new Error("dg2_out_of_bounds");
  }

  let value = 0;

  for (let index = 0; index < length; index += 1) {
    value = value * ONE_BYTE + bytes[offset + index];
  }

  return value;
}

function readTlvTag(
  bytes: Uint8Array,
  startOffset: number
): {
  tag: number;
  nextOffset: number;
} {
  if (startOffset >= bytes.length) {
    throw new Error("tlv_out_of_bounds");
  }

  let offset = startOffset;
  let tag = bytes[offset];
  offset += 1;

  if (tag % MULTI_BYTE_TAG_MASK !== MULTI_BYTE_TAG_SENTINEL) {
    return {
      tag,
      nextOffset: offset,
    };
  }

  let nextTagByte = 0;

  do {
    if (offset >= bytes.length) {
      throw new Error("tlv_tag_truncated");
    }

    nextTagByte = bytes[offset];
    tag = tag * ONE_BYTE + nextTagByte;
    offset += 1;
  } while (nextTagByte >= CONTINUATION_BYTE_MIN);

  return {
    tag,
    nextOffset: offset,
  };
}

function readTlvLength(
  bytes: Uint8Array,
  startOffset: number
): {
  length: number;
  nextOffset: number;
} {
  if (startOffset >= bytes.length) {
    throw new Error("tlv_length_truncated");
  }

  const firstLengthByte = bytes[startOffset];
  let offset = startOffset + 1;

  if (firstLengthByte < SHORT_LENGTH_MAX) {
    return {
      length: firstLengthByte,
      nextOffset: offset,
    };
  }

  const lengthByteCount = firstLengthByte % SHORT_LENGTH_MAX;

  if (
    lengthByteCount === 0 ||
    lengthByteCount > 4 ||
    offset + lengthByteCount > bytes.length
  ) {
    throw new Error("tlv_length_invalid");
  }

  let length = 0;

  for (let index = 0; index < lengthByteCount; index += 1) {
    length = length * ONE_BYTE + bytes[offset + index];
  }

  offset += lengthByteCount;

  return {
    length,
    nextOffset: offset,
  };
}

function readTlv(bytes: Uint8Array, startOffset: number): TlvValue {
  const { tag, nextOffset: valueOffset } = readTlvTag(bytes, startOffset);
  const { length, nextOffset } = readTlvLength(bytes, valueOffset);

  if (nextOffset + length > bytes.length) {
    throw new Error("tlv_value_truncated");
  }

  return {
    tag,
    value: bytes.slice(nextOffset, nextOffset + length),
    nextOffset: nextOffset + length,
  };
}

function parseIso197945FaceImage(data: Uint8Array): Dg2FaceImage {
  if (!startsWithBytes(data, FAC_HEADER)) {
    throw new Error("dg2_fac_header_invalid");
  }

  let offset = FAC_HEADER.length;

  offset += 4;
  offset += 4;
  offset += 2;

  offset += 4;
  const featurePointCount = readUint(data, offset, 2);
  offset += 2;
  offset += 1;
  offset += 1;
  offset += 1;
  offset += 3;
  offset += 2;
  offset += 3;
  offset += 3;
  offset += featurePointCount * FEATURE_POINT_SIZE;

  offset += 1;
  offset += 1;
  const imageWidth = readUint(data, offset, 2);
  offset += 2;
  const imageHeight = readUint(data, offset, 2);
  offset += 2;
  offset += 1;
  offset += 1;
  offset += 2;
  offset += 2;

  if (offset >= data.length) {
    throw new Error("dg2_image_missing");
  }

  const imageData = data.slice(offset);

  if (startsWithBytes(imageData, JPEG_SIGNATURE)) {
    return {
      imageData,
      imageFormat: "jpeg",
      imageHeight,
      imageWidth,
    };
  }

  if (
    startsWithBytes(imageData, JPEG_2000_FILE_SIGNATURE) ||
    startsWithBytes(imageData, JPEG_2000_CODESTREAM_SIGNATURE)
  ) {
    return {
      imageData,
      imageFormat: "jpeg2000",
      imageHeight,
      imageWidth,
    };
  }

  throw new Error("dg2_image_format_unsupported");
}

function getOpenJpegModule(): Promise<OpenJpegModule> {
  if (!openJpegPromise) {
    openJpegPromise = import("@cornerstonejs/codec-openjpeg/decodewasmjs").then(
      async (module) =>
        module.default({
          wasmBinary: await loadOpenJpegWasmBinary(),
        })
    );
  }

  return openJpegPromise;
}

function buildRgbaFromComponents(
  width: number,
  height: number,
  componentCount: number,
  pixels: Uint8Array | Uint8ClampedArray
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * RGBA_CHANNELS);

  if (componentCount === 1) {
    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const value = pixels[pixelIndex];
      const baseIndex = pixelIndex * RGBA_CHANNELS;
      rgba[baseIndex] = value;
      rgba[baseIndex + 1] = value;
      rgba[baseIndex + 2] = value;
      rgba[baseIndex + 3] = 255;
    }

    return rgba;
  }

  if (componentCount === 3 || componentCount === 4) {
    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const sourceIndex = pixelIndex * componentCount;
      const targetIndex = pixelIndex * RGBA_CHANNELS;
      rgba[targetIndex] = pixels[sourceIndex];
      rgba[targetIndex + 1] = pixels[sourceIndex + 1];
      rgba[targetIndex + 2] = pixels[sourceIndex + 2];
      rgba[targetIndex + 3] =
        componentCount === 4 ? pixels[sourceIndex + 3] : 255;
    }

    return rgba;
  }

  throw new Error("jpeg2000_component_count_unsupported");
}

async function decodeJpeg2000(bytes: Uint8Array): Promise<DecodedImage> {
  const openJpegModule = await getOpenJpegModule();
  const decoder = new openJpegModule.J2KDecoder();
  const encodedBuffer = decoder.getEncodedBuffer(bytes.length);
  encodedBuffer.set(bytes);

  decoder.readHeader?.();
  decoder.decode();

  const decodedBuffer = decoder.getDecodedBuffer();
  const frameInfo = decoder.getFrameInfo();

  return {
    width: frameInfo.width,
    height: frameInfo.height,
    rgba: buildRgbaFromComponents(
      frameInfo.width,
      frameInfo.height,
      frameInfo.componentCount,
      decodedBuffer
    ),
  };
}

function decodeJpeg(bytes: Uint8Array): DecodedImage {
  const decoded = jpeg.decode(bytes, {
    useTArray: true,
  });

  return {
    width: decoded.width,
    height: decoded.height,
    rgba: new Uint8ClampedArray(decoded.data),
  };
}

export function extractDg2FaceImage(dg2: Uint8Array): Dg2FaceImage {
  const outer = readTlv(dg2, 0);
  const root = outer.tag === DG2_FILE_TAG ? readTlv(outer.value, 0) : outer;

  if (root.tag !== DG2_ROOT_TAG) {
    throw new Error("dg2_root_tag_invalid");
  }

  let offset = 0;
  const numberOfInstances = readTlv(root.value, offset);
  if (numberOfInstances.tag !== 0x02) {
    throw new Error("dg2_instance_count_missing");
  }

  offset = numberOfInstances.nextOffset;
  const biometricGroup = readTlv(root.value, offset);
  if (biometricGroup.tag !== DG2_BIOMETRIC_GROUP_TAG) {
    throw new Error("dg2_biometric_group_missing");
  }

  let groupOffset = 0;

  while (groupOffset < biometricGroup.value.length) {
    const child = readTlv(biometricGroup.value, groupOffset);

    if (
      child.tag === DG2_BIOMETRIC_DATA_ALT_TAG ||
      child.tag === DG2_BIOMETRIC_DATA_TAG
    ) {
      return parseIso197945FaceImage(child.value);
    }

    groupOffset = child.nextOffset;
  }

  throw new Error("dg2_biometric_data_missing");
}

export function decodeFaceImageBytes(bytes: Uint8Array): Promise<DecodedImage> {
  if (startsWithBytes(bytes, JPEG_SIGNATURE)) {
    return Promise.resolve(decodeJpeg(bytes));
  }

  if (
    startsWithBytes(bytes, JPEG_2000_FILE_SIGNATURE) ||
    startsWithBytes(bytes, JPEG_2000_CODESTREAM_SIGNATURE)
  ) {
    return decodeJpeg2000(bytes);
  }

  throw new Error("image_format_unsupported");
}
