const ONE_BYTE = 0x1_00;
const MULTI_BYTE_TAG_MASK = 0x20;
const MULTI_BYTE_TAG_SENTINEL = 0x1f;
const CONTINUATION_BYTE_MIN = 0x80;
const SHORT_LENGTH_MAX = 0x80;

export type TlvValue = {
  tag: number;
  value: Uint8Array;
  nextOffset: number;
};

export function readTlvTag(
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

export function readTlvLength(
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

export function readTlv(bytes: Uint8Array, startOffset: number): TlvValue {
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
