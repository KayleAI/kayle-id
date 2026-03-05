export type VerifyChunkEntry = {
  chunkTotal: number;
  parts: Map<number, Uint8Array>;
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

export function processDataPayload({
  state,
  payload,
}: {
  state: VerifyTransferState;
  payload: VerifyDataPayload;
}): DataResult {
  const kind = payload.kind ?? 0;
  const raw = payload.raw ?? new Uint8Array();
  const index = payload.index ?? 0;
  const total = payload.total ?? 0;
  const chunkIndex = payload.chunkIndex ?? 0;
  const chunkTotal = payload.chunkTotal ?? 0;
  const chunkKey = `${kind}:${index}`;

  const assembled = assembleChunk({
    state,
    key: chunkKey,
    chunkIndex,
    chunkTotal,
    chunk: raw,
  });

  if (!assembled.complete) {
    return {
      acks: [`data_chunk_ok_${kind}_${index}_${chunkIndex}`],
      authenticityReady: false,
    };
  }

  const stored = storeData({
    state,
    kind,
    data: assembled.data ?? raw,
    total,
  });

  if (!stored.ok) {
    return {
      acks: [],
      error: {
        code: stored.code,
        message: stored.message,
      },
      authenticityReady: false,
    };
  }

  const ack =
    kind === 3 && state.selfieTotal && state.selfies.length >= state.selfieTotal
      ? `selfies_ok_${state.selfieTotal}`
      : `data_ok_${kind}_${index}`;

  return {
    acks: [ack],
    authenticityReady: isAuthenticityReady(state),
  };
}
