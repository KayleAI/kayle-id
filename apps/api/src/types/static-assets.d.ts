declare module "@cornerstonejs/codec-openjpeg/decodewasmjs" {
  const value: (options?: {
    wasmBinary?: ArrayBuffer | Uint8Array;
  }) => Promise<{
    J2KDecoder: new () => {
      getEncodedBuffer(length: number): Uint8Array;
      decode(): void;
      getDecodedBuffer(): Uint8Array | Uint8ClampedArray;
      getFrameInfo(): {
        width: number;
        height: number;
        componentCount: number;
      };
      readHeader?(): void;
    };
  }>;

  export default value;
}
