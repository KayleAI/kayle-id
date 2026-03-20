import { Integer, Null, OctetString, Sequence } from "asn1js";
import jpeg from "jpeg-js";
import {
  AlgorithmIdentifier,
  ContentInfo,
  EncapsulatedContentInfo,
  SignedData,
} from "pkijs";

const CMS_SIGNED_DATA_OID = "1.2.840.113549.1.7.2";
const ICAO_LDS_SECURITY_OBJECT_OID = "2.23.136.1.1.1";
const SHA_1_OID = "1.3.14.3.2.26";
const SHA_256_OID = "2.16.840.1.101.3.4.2.1";
const SHA_384_OID = "2.16.840.1.101.3.4.2.2";
const SHA_512_OID = "2.16.840.1.101.3.4.2.3";
const FAC_HEADER = [0x46, 0x41, 0x43, 0x00] as const;
const ONE_BYTE = 0x1_00;
const SHORT_LENGTH_MAX = 0x80;
const LONG_LENGTH_PREFIX = 0x80;
const ISO_19794_5_VERSION = 0x30_31_30_00;
const DG2_FILE_TAG = 0x75;
const DG2_ROOT_TAG = 0x7f_61;
const DG2_BIOMETRIC_GROUP_TAG = 0x7f_60;
const DG2_BIOMETRIC_DATA_TAG = 0x5f_2e;
const DG1_ROOT_TAG = 0x61;
const DG1_MRZ_TAG = 0x5f_1f;

type SupportedHashAlgorithm = "SHA-256" | "SHA-384" | "SHA-512" | "SHA-1";
type SupportedImageFormat = "jpeg" | "jpeg2000";
type FixtureName = "icon.jpg" | "icon.jp2" | "black.jpg";
const DEFAULT_VALIDATION_PORTRAIT_SIZE = 160;

const verifyFixtureBaseUrl = new URL("../fixtures/verify/", import.meta.url);
const fixtureCache = new Map<FixtureName, Promise<Uint8Array>>();
const validationPortraitCache = new Map<string, Promise<Uint8Array>>();

type BunFileRuntime = {
  file(path: URL): {
    arrayBuffer(): Promise<ArrayBuffer>;
  };
};

function bufferBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

function uintBytes(value: number, length: number): number[] {
  const bytes = new Array<number>(length);
  let remaining = value;

  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = remaining % ONE_BYTE;
    remaining = Math.floor(remaining / ONE_BYTE);
  }

  return bytes;
}

function tagBytes(tag: number): number[] {
  const hex = tag.toString(16).padStart(tag > 0xff ? 4 : 2, "0");
  const bytes: number[] = [];

  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }

  return bytes;
}

function lengthBytes(length: number): number[] {
  if (length < SHORT_LENGTH_MAX) {
    return [length];
  }

  const encoded: number[] = [];
  let remaining = length;

  while (remaining > 0) {
    encoded.unshift(remaining % ONE_BYTE);
    remaining = Math.floor(remaining / ONE_BYTE);
  }

  return [LONG_LENGTH_PREFIX + encoded.length, ...encoded];
}

function encodeTlv(tag: number, value: Uint8Array): Uint8Array {
  return Uint8Array.from([
    ...tagBytes(tag),
    ...lengthBytes(value.length),
    ...value,
  ]);
}

function hashAlgorithmOid(algorithm: SupportedHashAlgorithm): string {
  switch (algorithm) {
    case "SHA-1":
      return SHA_1_OID;
    case "SHA-256":
      return SHA_256_OID;
    case "SHA-384":
      return SHA_384_OID;
    case "SHA-512":
      return SHA_512_OID;
    default:
      throw new Error(`unsupported_hash_algorithm:${algorithm}`);
  }
}

function createAlgorithmIdentifier(
  algorithm: SupportedHashAlgorithm
): AlgorithmIdentifier {
  return new AlgorithmIdentifier({
    algorithmId: hashAlgorithmOid(algorithm),
    algorithmParams: new Null(),
  });
}

export function createSelfieJpeg({
  blue,
  green,
  height = 64,
  red,
  width = 64,
}: {
  red: number;
  green: number;
  blue: number;
  width?: number;
  height?: number;
}): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);

  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = red;
    rgba[offset + 1] = green;
    rgba[offset + 2] = blue;
    rgba[offset + 3] = 255;
  }

  const encoded = jpeg.encode(
    {
      data: rgba,
      width,
      height,
    },
    90
  );

  return new Uint8Array(encoded.data);
}

export function createLowSimilaritySelfies(): Uint8Array[] {
  return [
    createSelfieJpeg({
      red: 0,
      green: 0,
      blue: 0,
    }),
    createSelfieJpeg({
      red: 255,
      green: 255,
      blue: 255,
    }),
  ];
}

export function createTd3MrzText(): string {
  return [
    "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
    "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
  ].join("\n");
}

export function createDg1Artifact(mrzText: string): Uint8Array {
  const mrzBytes = new TextEncoder().encode(mrzText);
  return encodeTlv(DG1_ROOT_TAG, encodeTlv(DG1_MRZ_TAG, mrzBytes));
}

export async function createMismatchValidationSelfies(): Promise<Uint8Array[]> {
  return [
    ...createLowSimilaritySelfies(),
    await loadVerifyFixtureBytes("black.jpg"),
  ];
}

export async function createMatchingValidationSelfies(): Promise<Uint8Array[]> {
  return [
    await createValidationPortraitJpeg(),
    ...createLowSimilaritySelfies(),
  ];
}

export function createDg2Artifact({
  imageData,
  imageFormat,
  imageHeight = 32,
  imageWidth = 32,
  wrapWithEfTag = false,
}: {
  imageData: Uint8Array;
  imageFormat: SupportedImageFormat;
  imageWidth?: number;
  imageHeight?: number;
  wrapWithEfTag?: boolean;
}): Uint8Array {
  const facialRecordLength = 42 + imageData.length;
  const iso197945Record = Uint8Array.from([
    ...FAC_HEADER,
    ...uintBytes(ISO_19794_5_VERSION, 4),
    ...uintBytes(facialRecordLength, 4),
    ...uintBytes(1, 2),
    ...uintBytes(facialRecordLength, 4),
    ...uintBytes(0, 2),
    0x00,
    0x00,
    0x00,
    ...uintBytes(0, 3),
    ...uintBytes(0, 2),
    ...uintBytes(0, 3),
    ...uintBytes(0, 3),
    0x00,
    imageFormat === "jpeg" ? 0x00 : 0x01,
    ...uintBytes(imageWidth, 2),
    ...uintBytes(imageHeight, 2),
    0x01,
    0x02,
    ...uintBytes(0, 2),
    ...uintBytes(100, 2),
    ...imageData,
  ]);

  const biometricData = encodeTlv(DG2_BIOMETRIC_DATA_TAG, iso197945Record);
  const biometricHeader = encodeTlv(0xa1, new Uint8Array());
  const biometricGroup = encodeTlv(
    DG2_BIOMETRIC_GROUP_TAG,
    Uint8Array.from([...biometricHeader, ...biometricData])
  );

  const biometricRoot = encodeTlv(
    DG2_ROOT_TAG,
    Uint8Array.from([...encodeTlv(0x02, Uint8Array.of(1)), ...biometricGroup])
  );

  return wrapWithEfTag ? encodeTlv(DG2_FILE_TAG, biometricRoot) : biometricRoot;
}

export function createMalformedDg2Artifact(): Uint8Array {
  return encodeTlv(
    DG2_ROOT_TAG,
    Uint8Array.from([
      ...encodeTlv(0x02, Uint8Array.of(1)),
      ...encodeTlv(
        DG2_BIOMETRIC_GROUP_TAG,
        Uint8Array.from([
          ...encodeTlv(0xa1, new Uint8Array()),
          ...encodeTlv(
            DG2_BIOMETRIC_DATA_TAG,
            new Uint8Array([0x00, 0x01, 0x02])
          ),
        ])
      ),
    ])
  );
}

function getBunRuntime(): BunFileRuntime | null {
  const maybeBun = (
    globalThis as typeof globalThis & {
      Bun?: BunFileRuntime;
    }
  ).Bun;

  return typeof maybeBun?.file === "function" ? maybeBun : null;
}

export async function loadVerifyFixtureBytes(
  name: FixtureName
): Promise<Uint8Array> {
  let promise = fixtureCache.get(name);

  if (!promise) {
    const bunRuntime = getBunRuntime();

    if (!bunRuntime) {
      throw new Error("bun_runtime_required_for_verify_fixtures");
    }

    promise = bunRuntime
      .file(new URL(name, verifyFixtureBaseUrl))
      .arrayBuffer()
      .then((buffer) => new Uint8Array(buffer));
    fixtureCache.set(name, promise);
  }

  return exactBytes(await promise);
}

function exactBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function resizeRgbaNearestNeighbor({
  data,
  sourceHeight,
  sourceWidth,
  targetHeight,
  targetWidth,
}: {
  data: Uint8Array;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}): Uint8Array {
  const resized = new Uint8Array(targetWidth * targetHeight * 4);

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = Math.min(
      sourceHeight - 1,
      Math.floor((targetY * sourceHeight) / targetHeight)
    );

    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = Math.min(
        sourceWidth - 1,
        Math.floor((targetX * sourceWidth) / targetWidth)
      );
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
      const targetOffset = (targetY * targetWidth + targetX) * 4;

      resized[targetOffset] = data[sourceOffset] ?? 0;
      resized[targetOffset + 1] = data[sourceOffset + 1] ?? 0;
      resized[targetOffset + 2] = data[sourceOffset + 2] ?? 0;
      resized[targetOffset + 3] = data[sourceOffset + 3] ?? 255;
    }
  }

  return resized;
}

export async function createValidationPortraitJpeg({
  height = DEFAULT_VALIDATION_PORTRAIT_SIZE,
  width = DEFAULT_VALIDATION_PORTRAIT_SIZE,
}: {
  width?: number;
  height?: number;
} = {}): Promise<Uint8Array> {
  const cacheKey = `${width}x${height}`;
  const cached = validationPortraitCache.get(cacheKey);

  if (cached) {
    return exactBytes(await cached);
  }

  const promise = loadVerifyFixtureBytes("icon.jpg").then((sourceBytes) => {
    const decoded = jpeg.decode(sourceBytes, {
      useTArray: true,
    });

    if (decoded.width === width && decoded.height === height) {
      return exactBytes(sourceBytes);
    }

    const resized = resizeRgbaNearestNeighbor({
      data: decoded.data,
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      targetWidth: width,
      targetHeight: height,
    });

    return Uint8Array.from(
      jpeg.encode(
        {
          data: resized,
          width,
          height,
        },
        90
      ).data
    );
  });

  validationPortraitCache.set(cacheKey, promise);
  return exactBytes(await promise);
}

export async function createSodArtifact({
  algorithm = "SHA-256",
  dg1,
  dg1HashOverride,
  dg2,
  dg2HashOverride,
  includeDg1Hash = true,
  includeDg2Hash = true,
}: {
  dg1: Uint8Array;
  dg2: Uint8Array;
  algorithm?: SupportedHashAlgorithm;
  includeDg1Hash?: boolean;
  includeDg2Hash?: boolean;
  dg1HashOverride?: Uint8Array;
  dg2HashOverride?: Uint8Array;
}): Promise<Uint8Array> {
  const [dg1Digest, dg2Digest] = await Promise.all([
    crypto.subtle.digest(algorithm, bufferBytes(dg1)),
    crypto.subtle.digest(algorithm, bufferBytes(dg2)),
  ]);
  const dataGroupHashes: Sequence[] = [];

  if (includeDg1Hash) {
    dataGroupHashes.push(
      new Sequence({
        value: [
          new Integer({
            value: 1,
          }),
          new OctetString({
            valueHex: bufferBytes(dg1HashOverride ?? new Uint8Array(dg1Digest)),
          }),
        ],
      })
    );
  }

  if (includeDg2Hash) {
    dataGroupHashes.push(
      new Sequence({
        value: [
          new Integer({
            value: 2,
          }),
          new OctetString({
            valueHex: bufferBytes(dg2HashOverride ?? new Uint8Array(dg2Digest)),
          }),
        ],
      })
    );
  }

  const ldsSecurityObject = new Sequence({
    value: [
      new Integer({
        value: 0,
      }),
      createAlgorithmIdentifier(algorithm).toSchema(),
      new Sequence({
        value: dataGroupHashes,
      }),
    ],
  });

  const signedData = new SignedData({
    version: 1,
    digestAlgorithms: [createAlgorithmIdentifier(algorithm)],
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: ICAO_LDS_SECURITY_OBJECT_OID,
      eContent: new OctetString({
        valueHex: ldsSecurityObject.toBER(false),
      }),
    }),
    signerInfos: [],
  });

  const contentInfo = new ContentInfo({
    contentType: CMS_SIGNED_DATA_OID,
    content: signedData.toSchema(),
  });

  return new Uint8Array(contentInfo.toSchema().toBER(false));
}

export async function createValidNfcArtifacts({
  dg1 = createDg1Artifact(createTd3MrzText()),
  dg2,
  dg2ImageData,
  dg2ImageFormat = "jpeg",
}: {
  dg1?: Uint8Array;
  dg2?: Uint8Array;
  dg2ImageData?: Uint8Array;
  dg2ImageFormat?: SupportedImageFormat;
} = {}): Promise<{
  dg1: Uint8Array;
  dg2: Uint8Array;
  sod: Uint8Array;
}> {
  const resolvedDg2 =
    dg2 ??
    createDg2Artifact({
      imageData: dg2ImageData ?? (await createValidationPortraitJpeg()),
      imageFormat: dg2ImageFormat,
    });

  return {
    dg1,
    dg2: resolvedDg2,
    sod: await createSodArtifact({
      dg1,
      dg2: resolvedDg2,
    }),
  };
}

export async function createInvalidAuthenticityArtifacts(): Promise<{
  dg1: Uint8Array;
  dg2: Uint8Array;
  sod: Uint8Array;
}> {
  const dg1 = createDg1Artifact(createTd3MrzText());
  const dg2 = createDg2Artifact({
    imageData: await loadVerifyFixtureBytes("icon.jpg"),
    imageFormat: "jpeg",
  });

  return {
    dg1,
    dg2,
    sod: await createSodArtifact({
      dg1,
      dg2,
      dg1HashOverride: new Uint8Array(32).fill(0),
      dg2HashOverride: new Uint8Array(32).fill(0),
    }),
  };
}
