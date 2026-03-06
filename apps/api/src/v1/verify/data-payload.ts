export type VerifyChunkEntry = {
  chunkTotal: number;
  parts: Map<number, Uint8Array>;
};

type RequiredNfcArtifact = "dg1" | "dg2" | "sod";

export type MissingNfcChunk = {
  kind: number;
  index: number;
  chunkTotal: number;
  missingChunkIndices: number[];
};

export type NfcTransferStatus = {
  complete: boolean;
  missingArtifacts: RequiredNfcArtifact[];
  missingChunks: MissingNfcChunk[];
};

export type VerifyTransferState = {
  dg1?: Uint8Array;
  dg2?: Uint8Array;
  sod?: Uint8Array;
  selfies: Uint8Array[];
  chunks: Map<string, VerifyChunkEntry>;
  selfieTotal?: number;
};

export type VerifyDataPayload = {
  kind?: number;
  raw?: Uint8Array;
  index?: number;
  total?: number;
  chunkIndex?: number;
  chunkTotal?: number;
};

type DataResult = {
  acks: string[];
  error?: {
    code: string;
    message: string;
  };
  authenticityReady: boolean;
  nfcStatus: NfcTransferStatus;
};

export function createTransferState(): VerifyTransferState {
  return {
    selfies: [],
    chunks: new Map(),
  };
}

export function resetTransferState(state: VerifyTransferState): void {
  state.selfies = [];
  state.dg1 = undefined;
  state.dg2 = undefined;
  state.sod = undefined;
  state.chunks.clear();
  state.selfieTotal = undefined;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function parseChunkKey(key: string): { kind: number; index: number } | null {
  const [kindPart, indexPart] = key.split(":");
  const kind = Number(kindPart);
  const index = Number(indexPart);

  if (!(isNonNegativeInteger(kind) && isNonNegativeInteger(index))) {
    return null;
  }

  return { kind, index };
}

function createChunkRetryMessage({
  kind,
  index,
  chunkIndex,
  reason,
}: {
  kind: number;
  index: number;
  chunkIndex: number;
  reason: string;
}): string {
  return JSON.stringify({
    kind,
    index,
    chunkIndex,
    reason,
  });
}

function getMissingChunkIndices(entry: VerifyChunkEntry): number[] {
  const missing: number[] = [];
  for (let index = 0; index < entry.chunkTotal; index += 1) {
    if (!entry.parts.has(index)) {
      missing.push(index);
    }
  }
  return missing;
}

export function isNfcDataKind(kind: number): boolean {
  return kind === 0 || kind === 1 || kind === 2;
}

export function getNfcTransferStatus(
  state: VerifyTransferState
): NfcTransferStatus {
  const missingArtifacts: RequiredNfcArtifact[] = [];

  if (!state.dg1) {
    missingArtifacts.push("dg1");
  }
  if (!state.dg2) {
    missingArtifacts.push("dg2");
  }
  if (!state.sod) {
    missingArtifacts.push("sod");
  }

  const missingChunks: MissingNfcChunk[] = [];

  for (const [key, entry] of state.chunks.entries()) {
    const parsed = parseChunkKey(key);
    if (!(parsed && isNfcDataKind(parsed.kind))) {
      continue;
    }

    const missingChunkIndices = getMissingChunkIndices(entry);
    if (missingChunkIndices.length === 0) {
      continue;
    }

    missingChunks.push({
      kind: parsed.kind,
      index: parsed.index,
      chunkTotal: entry.chunkTotal,
      missingChunkIndices,
    });
  }

  return {
    complete: missingArtifacts.length === 0 && missingChunks.length === 0,
    missingArtifacts,
    missingChunks,
  };
}

function getOrCreateChunkEntry(
  chunks: Map<string, VerifyChunkEntry>,
  key: string,
  chunkTotal: number
): VerifyChunkEntry {
  const existing = chunks.get(key);
  if (existing) {
    if (existing.chunkTotal !== chunkTotal) {
      existing.chunkTotal = chunkTotal;
    }
    return existing;
  }

  const entry = {
    chunkTotal,
    parts: new Map<number, Uint8Array>(),
  };
  chunks.set(key, entry);
  return entry;
}

function collectChunks(entry: VerifyChunkEntry): Uint8Array[] | null {
  const buffers: Uint8Array[] = [];

  for (let index = 0; index < entry.chunkTotal; index += 1) {
    const part = entry.parts.get(index);
    if (!part) {
      return null;
    }
    buffers.push(part);
  }

  return buffers;
}

function mergeChunks(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }

  return merged;
}

function assembleChunk({
  state,
  key,
  chunkIndex,
  chunkTotal,
  chunk,
}: {
  state: VerifyTransferState;
  key: string;
  chunkIndex: number;
  chunkTotal: number;
  chunk: Uint8Array;
}): { complete: boolean; data?: Uint8Array } {
  if (chunkTotal <= 1) {
    return { complete: true, data: chunk };
  }

  const entry = getOrCreateChunkEntry(state.chunks, key, chunkTotal);
  entry.parts.set(chunkIndex, chunk);

  if (entry.parts.size < entry.chunkTotal) {
    return { complete: false };
  }

  const buffers = collectChunks(entry);
  if (!buffers) {
    return { complete: false };
  }

  const merged = mergeChunks(buffers);
  state.chunks.delete(key);
  return { complete: true, data: merged };
}

function storeData({
  state,
  kind,
  data,
  total,
}: {
  state: VerifyTransferState;
  kind: number;
  data: Uint8Array;
  total: number;
}): { ok: true } | { ok: false; code: string; message: string } {
  switch (kind) {
    case 0:
      state.dg1 = data;
      return { ok: true };
    case 1:
      state.dg2 = data;
      return { ok: true };
    case 2:
      state.sod = data;
      return { ok: true };
    case 3:
      state.selfies.push(data);
      if (total > 0) {
        state.selfieTotal = total;
      }
      return { ok: true };
    default:
      return {
        ok: false,
        code: "UNKNOWN_DATA_KIND",
        message: "Unknown data kind.",
      };
  }
}

function isAuthenticityReady(state: VerifyTransferState): boolean {
  return Boolean(state.dg1 && state.dg2 && state.sod);
}

type NormalizedDataPayload = {
  kind: number;
  raw: Uint8Array;
  index: number;
  total: number;
  chunkIndex: number;
  chunkTotal: number;
  chunkKey: string;
};

function normalizeDataPayload(
  payload: VerifyDataPayload
): NormalizedDataPayload {
  const kind = payload.kind ?? 0;
  const raw = payload.raw ?? new Uint8Array();
  const index = payload.index ?? 0;
  const total = payload.total ?? 0;
  const chunkIndex = payload.chunkIndex ?? 0;
  const chunkTotal =
    payload.chunkTotal && payload.chunkTotal > 0 ? payload.chunkTotal : 1;

  return {
    kind,
    raw,
    index,
    total,
    chunkIndex,
    chunkTotal,
    chunkKey: `${kind}:${index}`,
  };
}

function createErrorResult({
  state,
  code,
  message,
}: {
  state: VerifyTransferState;
  code: string;
  message: string;
}): DataResult {
  return {
    acks: [],
    error: {
      code,
      message,
    },
    authenticityReady: false,
    nfcStatus: getNfcTransferStatus(state),
  };
}

function createChunkRetryResult({
  state,
  kind,
  index,
  chunkIndex,
  reason,
}: {
  state: VerifyTransferState;
  kind: number;
  index: number;
  chunkIndex: number;
  reason: string;
}): DataResult {
  return createErrorResult({
    state,
    code: "DATA_CHUNK_RETRY",
    message: createChunkRetryMessage({
      kind,
      index,
      chunkIndex,
      reason,
    }),
  });
}

function validateDataPayload({
  state,
  kind,
  index,
  total,
  chunkIndex,
  chunkTotal,
  chunkKey,
}: NormalizedDataPayload & { state: VerifyTransferState }): DataResult | null {
  if (!(isNonNegativeInteger(index) && isNonNegativeInteger(total))) {
    return createChunkRetryResult({
      state,
      kind,
      index,
      chunkIndex,
      reason: "invalid_index_or_total",
    });
  }

  if (
    !(
      isNonNegativeInteger(chunkIndex) &&
      isNonNegativeInteger(chunkTotal) &&
      chunkIndex < chunkTotal
    )
  ) {
    return createChunkRetryResult({
      state,
      kind,
      index,
      chunkIndex,
      reason: "invalid_chunk_range",
    });
  }

  const existingChunkEntry = state.chunks.get(chunkKey);
  if (existingChunkEntry && existingChunkEntry.chunkTotal !== chunkTotal) {
    return createChunkRetryResult({
      state,
      kind,
      index,
      chunkIndex,
      reason: "chunk_total_mismatch",
    });
  }

  return null;
}

export function processDataPayload({
  state,
  payload,
}: {
  state: VerifyTransferState;
  payload: VerifyDataPayload;
}): DataResult {
  const normalizedPayload = normalizeDataPayload(payload);

  const validationResult = validateDataPayload({
    state,
    ...normalizedPayload,
  });
  if (validationResult) {
    return validationResult;
  }

  const assembled = assembleChunk({
    state,
    key: normalizedPayload.chunkKey,
    chunkIndex: normalizedPayload.chunkIndex,
    chunkTotal: normalizedPayload.chunkTotal,
    chunk: normalizedPayload.raw,
  });

  if (!assembled.complete) {
    return {
      acks: [
        `data_chunk_ok_${normalizedPayload.kind}_${normalizedPayload.index}_${normalizedPayload.chunkIndex}`,
      ],
      authenticityReady: false,
      nfcStatus: getNfcTransferStatus(state),
    };
  }

  const stored = storeData({
    state,
    kind: normalizedPayload.kind,
    data: assembled.data ?? normalizedPayload.raw,
    total: normalizedPayload.total,
  });

  if (!stored.ok) {
    return createErrorResult({
      state,
      code: stored.code,
      message: stored.message,
    });
  }

  const ack =
    normalizedPayload.kind === 3 &&
    state.selfieTotal &&
    state.selfies.length >= state.selfieTotal
      ? `selfies_ok_${state.selfieTotal}`
      : `data_ok_${normalizedPayload.kind}_${normalizedPayload.index}`;

  return {
    acks: [ack],
    authenticityReady: isAuthenticityReady(state),
    nfcStatus: getNfcTransferStatus(state),
  };
}
