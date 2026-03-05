import { describe, expect, test } from "bun:test";
import {
  createTransferState,
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
  });
});
