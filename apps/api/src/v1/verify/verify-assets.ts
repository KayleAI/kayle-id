import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OPENJPEG_PUBLIC_ASSET_PATH = "/verify/openjpegwasm_decode.bin";

type BinaryAssetSource = string | ArrayBuffer | Uint8Array;
export type WorkerAssetBinding = {
  fetch: typeof fetch;
};

const binaryAssetCache = new Map<string, Promise<Uint8Array>>();
let workerAssetFetcher: ((pathname: string) => Promise<Uint8Array>) | null =
  null;

function exactBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function isRemoteAssetSource(source: string): boolean {
  return (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  );
}

function isArrayBufferLike(value: unknown): value is ArrayBufferLike {
  const tag = Object.prototype.toString.call(value);
  return tag === "[object ArrayBuffer]" || tag === "[object SharedArrayBuffer]";
}

export function configureVerifyAssetFetcher(
  fetcher: ((pathname: string) => Promise<Uint8Array>) | null
): void {
  workerAssetFetcher = fetcher;
}

export function getWorkerAssetBinding(env: unknown): WorkerAssetBinding | null {
  if (!env || typeof env !== "object") {
    return null;
  }

  const candidate = Reflect.get(env, "ASSETS");

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const fetchBinding = Reflect.get(candidate, "fetch");

  return typeof fetchBinding === "function"
    ? {
        fetch: fetchBinding as typeof fetch,
      }
    : null;
}

export function configureVerifyAssetFetcherFromEnv(env: unknown): void {
  const assetBinding = getWorkerAssetBinding(env);

  if (!assetBinding) {
    configureVerifyAssetFetcher(null);
    return;
  }

  configureVerifyAssetFetcher(async (pathname) => {
    const request = new Request(
      new URL(pathname, "https://assets.kayle.id").toString()
    );
    const response = await assetBinding.fetch(request);

    if (!response.ok) {
      throw new Error(`asset_fetch_failed:${pathname}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  });
}

async function loadBinaryAsset(source: BinaryAssetSource): Promise<Uint8Array> {
  if (ArrayBuffer.isView(source)) {
    return exactBytes(
      new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    );
  }

  if (isArrayBufferLike(source)) {
    return new Uint8Array(source);
  }

  if (typeof source !== "string") {
    throw new Error(
      `asset_source_invalid:${Object.prototype.toString.call(source)}`
    );
  }

  let promise = binaryAssetCache.get(source);

  if (!promise) {
    if (source.startsWith("/") && workerAssetFetcher) {
      promise = workerAssetFetcher(source);
    } else if (isRemoteAssetSource(source)) {
      promise = fetch(source).then(async (response) => {
        if (!response.ok) {
          throw new Error(`asset_fetch_failed:${source}`);
        }

        return new Uint8Array(await response.arrayBuffer());
      });
    } else {
      promise = readFile(
        source.startsWith("file:") ? fileURLToPath(source) : source
      ).then(
        (buffer) =>
          new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      );
    }

    binaryAssetCache.set(source, promise);
  }

  return exactBytes(await promise);
}

function resolveOpenJpegWasmSource(): BinaryAssetSource {
  if (workerAssetFetcher) {
    return OPENJPEG_PUBLIC_ASSET_PATH;
  }

  return new URL(
    "../../../public/verify/openjpegwasm_decode.bin",
    import.meta.url
  ).toString();
}

export function loadOpenJpegWasmBinary(): Promise<Uint8Array> {
  return loadBinaryAsset(resolveOpenJpegWasmSource());
}
