import { describe, expect, test } from "bun:test";
import {
  createTransferState,
  getNfcTransferStatus,
  processDataPayload,
} from "@/v1/verify/data-payload";

describe("verify data payload processor", () => {
  test("acks incomplete chunk payloads", () => {
    const state = createTransferState();

    const result = processDataPayload({
      state,
      payload: {
        kind: 0,
        raw: new Uint8Array([1]),
        index: 0,
        total: 1,
        chunkIndex: 0,
        chunkTotal: 2,
      },
    });

    expect(result.acks).toEqual(["data_chunk_ok_0_0_0"]);
    expect(result.authenticityReady).toBeFalse();
  });

  test("acks completed DG payloads and marks authenticity readiness", () => {
    const state = createTransferState();

    processDataPayload({
      state,
      payload: {
        kind: 0,
        raw: new Uint8Array([1]),
        index: 0,
        total: 1,
      },
    });

    processDataPayload({
      state,
      payload: {
        kind: 1,
        raw: new Uint8Array([2]),
        index: 0,
        total: 1,
      },
    });

    const result = processDataPayload({
      state,
      payload: {
        kind: 2,
        raw: new Uint8Array([3]),
        index: 0,
        total: 1,
      },
    });

    expect(result.acks).toEqual(["data_ok_2_0"]);
    expect(result.authenticityReady).toBeTrue();
    expect(result.nfcStatus.complete).toBeTrue();
  });

  test("supports out-of-order chunk reassembly for DG payloads", () => {
    const state = createTransferState();

    const firstChunk = processDataPayload({
      state,
      payload: {
        kind: 1,
        raw: new Uint8Array([2]),
        index: 0,
        total: 1,
        chunkIndex: 1,
        chunkTotal: 2,
      },
    });

    expect(firstChunk.acks).toEqual(["data_chunk_ok_1_0_1"]);

    const secondChunk = processDataPayload({
      state,
      payload: {
        kind: 1,
        raw: new Uint8Array([1]),
        index: 0,
        total: 1,
        chunkIndex: 0,
        chunkTotal: 2,
      },
    });

    expect(secondChunk.acks).toEqual(["data_ok_1_0"]);
    expect(Array.from(state.dg2 ?? new Uint8Array())).toEqual([1, 2]);
  });

  test("exposes missing chunk metadata for incomplete NFC artifacts", () => {
    const state = createTransferState();

    processDataPayload({
      state,
      payload: {
        kind: 0,
        raw: new Uint8Array([1]),
        index: 0,
        total: 1,
        chunkIndex: 0,
        chunkTotal: 3,
      },
    });

    const status = getNfcTransferStatus(state);

    expect(status.complete).toBeFalse();
    expect(status.missingArtifacts).toEqual(["dg1", "dg2", "sod"]);
    expect(status.missingChunks).toEqual([
      {
        kind: 0,
        index: 0,
        chunkTotal: 3,
        missingChunkIndices: [1, 2],
      },
    ]);
  });

  test("returns DATA_CHUNK_RETRY for invalid chunk metadata", () => {
    const state = createTransferState();

    const result = processDataPayload({
      state,
      payload: {
        kind: 1,
        raw: new Uint8Array([1]),
        index: 0,
        total: 1,
        chunkIndex: 2,
        chunkTotal: 2,
      },
    });

    expect(result.error?.code).toBe("DATA_CHUNK_RETRY");
    expect(result.acks).toEqual([]);
    expect(result.authenticityReady).toBeFalse();
  });
});
