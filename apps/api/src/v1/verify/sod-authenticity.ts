import { fromBER, Integer, OctetString, Sequence } from "asn1js";
import { AlgorithmIdentifier, ContentInfo, SignedData, setEngine } from "pkijs";
import type {
  AuthenticityValidationResult,
  SupportedHashAlgorithm,
} from "./validation-types";

const ICAO_LDS_SECURITY_OBJECT_OID = "2.23.136.1.1.1";
const CMS_SIGNED_DATA_OID = "1.2.840.113549.1.7.2";
const SHA_1_OID = "1.3.14.3.2.26";
const SHA_256_OID = "2.16.840.1.101.3.4.2.1";
const SHA_384_OID = "2.16.840.1.101.3.4.2.2";
const SHA_512_OID = "2.16.840.1.101.3.4.2.3";

type ParsedSodSecurityObject = {
  algorithm: SupportedHashAlgorithm;
  dg1Hash: Uint8Array;
  dg2Hash: Uint8Array;
};

let pkijsConfigured = false;

function exactBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }

  return combined;
}

function asn1Buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

function ensurePkijsEngine(): void {
  if (pkijsConfigured) {
    return;
  }

  setEngine("kayle-id-worker", crypto, crypto.subtle);
  pkijsConfigured = true;
}

function subtleAlgorithmFromOid(oid: string): SupportedHashAlgorithm | null {
  switch (oid) {
    case SHA_1_OID:
      return "SHA-1";
    case SHA_256_OID:
      return "SHA-256";
    case SHA_384_OID:
      return "SHA-384";
    case SHA_512_OID:
      return "SHA-512";
    default:
      return null;
  }
}

function octetStringBytes(value: OctetString): Uint8Array {
  if (!value.idBlock.isConstructed) {
    return exactBytes(value.valueBlock.valueHexView);
  }

  const parts = value.valueBlock.value.map((child) => {
    if (!(child instanceof OctetString)) {
      throw new Error("invalid_octet_string_child");
    }

    return octetStringBytes(child);
  });

  return concatUint8Arrays(parts);
}

function parseBer(bytes: Uint8Array, errorCode: string): unknown {
  const decoded = fromBER(asn1Buffer(bytes));

  if (decoded.offset === -1) {
    throw new Error(errorCode);
  }

  return decoded.result;
}

function parseContentInfo(sod: Uint8Array): ContentInfo {
  const schema = parseBer(sod, "sod_parse_failed");

  try {
    return new ContentInfo({
      schema,
    });
  } catch {
    throw new Error("sod_parse_failed");
  }
}

function parseSignedData(contentInfo: ContentInfo): SignedData {
  if (contentInfo.contentType !== CMS_SIGNED_DATA_OID) {
    throw new Error("sod_content_type_invalid");
  }

  try {
    return new SignedData({
      schema: contentInfo.content,
    });
  } catch {
    throw new Error("sod_parse_failed");
  }
}

function parseLdsSecurityObjectRoot(signedData: SignedData): Sequence {
  if (
    signedData.encapContentInfo.eContentType !== ICAO_LDS_SECURITY_OBJECT_OID
  ) {
    throw new Error("lds_security_object_missing");
  }

  const eContent = signedData.encapContentInfo.eContent;

  if (!eContent) {
    throw new Error("lds_security_object_missing");
  }

  const result = parseBer(
    octetStringBytes(eContent),
    "lds_security_object_parse_failed"
  );

  if (!(result instanceof Sequence)) {
    throw new Error("lds_security_object_invalid");
  }

  return result;
}

function parseLdsSecurityObjectNodes(root: Sequence): {
  hashAlgorithmNode: Sequence;
  hashValuesNode: Sequence;
} {
  const [versionNode, hashAlgorithmNode, hashValuesNode] =
    root.valueBlock.value;

  if (
    !(
      versionNode instanceof Integer &&
      hashAlgorithmNode instanceof Sequence &&
      hashValuesNode instanceof Sequence
    )
  ) {
    throw new Error("lds_security_object_invalid");
  }

  return {
    hashAlgorithmNode,
    hashValuesNode,
  };
}

function parseDigestAlgorithm(
  hashAlgorithmNode: Sequence
): SupportedHashAlgorithm {
  const hashAlgorithm = new AlgorithmIdentifier({
    schema: hashAlgorithmNode,
  });
  const algorithm = subtleAlgorithmFromOid(hashAlgorithm.algorithmId);

  if (!algorithm) {
    throw new Error("unsupported_digest_algorithm");
  }

  return algorithm;
}

function parseDgHashEntry(child: unknown): {
  dataGroupNumber: number;
  digest: Uint8Array;
} {
  if (!(child instanceof Sequence) || child.valueBlock.value.length < 2) {
    throw new Error("dg_hash_entry_invalid");
  }

  const [dataGroupNumberNode, dataGroupHashNode] = child.valueBlock.value;

  if (
    !(
      dataGroupNumberNode instanceof Integer &&
      dataGroupHashNode instanceof OctetString
    )
  ) {
    throw new Error("dg_hash_entry_invalid");
  }

  return {
    dataGroupNumber: dataGroupNumberNode.valueBlock.valueDec,
    digest: octetStringBytes(dataGroupHashNode),
  };
}

function parseRequiredDgHashes(hashValuesNode: Sequence): {
  dg1Hash: Uint8Array;
  dg2Hash: Uint8Array;
} {
  let dg1Hash: Uint8Array | null = null;
  let dg2Hash: Uint8Array | null = null;

  for (const child of hashValuesNode.valueBlock.value) {
    const { dataGroupNumber, digest } = parseDgHashEntry(child);

    if (dataGroupNumber === 1) {
      dg1Hash = digest;
      continue;
    }

    if (dataGroupNumber === 2) {
      dg2Hash = digest;
    }
  }

  if (!(dg1Hash && dg2Hash)) {
    throw new Error("required_dg_hash_missing");
  }

  return {
    dg1Hash,
    dg2Hash,
  };
}

function parseSodSecurityObject(sod: Uint8Array): ParsedSodSecurityObject {
  ensurePkijsEngine();
  const contentInfo = parseContentInfo(sod);
  const signedData = parseSignedData(contentInfo);
  const root = parseLdsSecurityObjectRoot(signedData);
  const { hashAlgorithmNode, hashValuesNode } =
    parseLdsSecurityObjectNodes(root);
  const algorithm = parseDigestAlgorithm(hashAlgorithmNode);
  const { dg1Hash, dg2Hash } = parseRequiredDgHashes(hashValuesNode);

  return {
    algorithm,
    dg1Hash,
    dg2Hash,
  };
}

async function createDigest(
  algorithm: SupportedHashAlgorithm,
  data: Uint8Array
): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(algorithm, data));
}

export async function validateAuthenticity({
  dg1,
  dg2,
  sod,
}: {
  dg1: Uint8Array;
  dg2: Uint8Array;
  sod: Uint8Array;
}): Promise<AuthenticityValidationResult> {
  if (!(dg1.length && dg2.length && sod.length)) {
    return {
      ok: false,
      reason: "missing_required_artifacts",
    };
  }

  try {
    const parsed = parseSodSecurityObject(sod);
    const [dg1Digest, dg2Digest] = await Promise.all([
      createDigest(parsed.algorithm, dg1),
      createDigest(parsed.algorithm, dg2),
    ]);

    if (
      !(
        bytesEqual(dg1Digest, parsed.dg1Hash) &&
        bytesEqual(dg2Digest, parsed.dg2Hash)
      )
    ) {
      return {
        ok: false,
        reason: "dg_hash_mismatch",
      };
    }

    return {
      ok: true,
      algorithm: parsed.algorithm,
      source: "cms_signed_data",
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "authenticity_validation_failed",
    };
  }
}
