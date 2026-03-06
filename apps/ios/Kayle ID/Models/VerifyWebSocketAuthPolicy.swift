import Foundation

enum VerifyHelloResponse: Equatable {
  case success
  case failure(code: String, message: String)
}

struct VerifyChunkRetryInstruction: Equatable {
  let kind: Int
  let index: Int
  let chunkIndex: Int
  let reason: String
}

struct VerifyMissingNFCChunk: Equatable {
  let kind: Int
  let index: Int
  let chunkTotal: Int?
  let missingChunkIndices: [Int]
}

struct VerifyMissingNFCDataInstruction: Equatable {
  let missingArtifacts: [String]
  let missingChunks: [VerifyMissingNFCChunk]
}

struct VerifyMissingSelfieDataInstruction: Equatable {
  let requiredTotal: Int
  let missingSelfieIndexes: [Int]
  let missingChunks: [VerifyMissingNFCChunk]
}

nonisolated func isExpectedDataAck(
  ackMessage: String?,
  kind: Int,
  index: Int,
  chunkIndex: Int,
  chunkTotal: Int
) -> Bool {
  guard let ackMessage else {
    return false
  }

  if chunkTotal <= 1 {
    return ackMessage == "data_ok_\(kind)_\(index)"
  }

  let chunkAck = "data_chunk_ok_\(kind)_\(index)_\(chunkIndex)"
  let finalAck = "data_ok_\(kind)_\(index)"
  return ackMessage == chunkAck || ackMessage == finalAck
}

nonisolated func parseChunkRetryInstruction(
  errorCode: String?,
  errorMessage: String?
) -> VerifyChunkRetryInstruction? {
  guard errorCode == "DATA_CHUNK_RETRY", let errorMessage else {
    return nil
  }

  guard
    let data = errorMessage.data(using: .utf8),
    let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let kind = json["kind"] as? Int,
    let index = json["index"] as? Int,
    let chunkIndex = json["chunkIndex"] as? Int
  else {
    return nil
  }

  let reason = json["reason"] as? String ?? "unknown"
  return VerifyChunkRetryInstruction(
    kind: kind,
    index: index,
    chunkIndex: chunkIndex,
    reason: reason
  )
}

nonisolated func parseMissingNFCDataInstruction(
  errorCode: String?,
  errorMessage: String?
) -> VerifyMissingNFCDataInstruction? {
  guard errorCode == "NFC_REQUIRED_DATA_MISSING", let errorMessage else {
    return nil
  }

  guard
    let data = errorMessage.data(using: .utf8),
    let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else {
    return nil
  }

  let missingArtifacts = json["missing_artifacts"] as? [String] ?? []
  let rawChunks = json["missing_chunks"] as? [[String: Any]] ?? []
  let missingChunks: [VerifyMissingNFCChunk] = rawChunks.compactMap { chunk in
    guard
      let kind = chunk["kind"] as? Int,
      let index = chunk["index"] as? Int
    else {
      return nil
    }

    let chunkTotal = chunk["chunk_total"] as? Int
    let missingChunkIndices = chunk["missing_chunk_indices"] as? [Int] ?? []
    return VerifyMissingNFCChunk(
      kind: kind,
      index: index,
      chunkTotal: chunkTotal,
      missingChunkIndices: missingChunkIndices
    )
  }

  return VerifyMissingNFCDataInstruction(
    missingArtifacts: missingArtifacts,
    missingChunks: missingChunks
  )
}

nonisolated func parseMissingSelfieDataInstruction(
  errorCode: String?,
  errorMessage: String?
) -> VerifyMissingSelfieDataInstruction? {
  guard errorCode == "SELFIE_REQUIRED_DATA_MISSING", let errorMessage else {
    return nil
  }

  guard
    let data = errorMessage.data(using: .utf8),
    let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else {
    return nil
  }

  let requiredTotal = json["required_total"] as? Int ?? 0
  let missingSelfieIndexes = json["missing_selfie_indexes"] as? [Int] ?? []
  let rawChunks = json["missing_chunks"] as? [[String: Any]] ?? []
  let missingChunks: [VerifyMissingNFCChunk] = rawChunks.compactMap { chunk in
    guard
      let kind = chunk["kind"] as? Int,
      let index = chunk["index"] as? Int
    else {
      return nil
    }

    let chunkTotal = chunk["chunk_total"] as? Int
    let missingChunkIndices = chunk["missing_chunk_indices"] as? [Int] ?? []
    return VerifyMissingNFCChunk(
      kind: kind,
      index: index,
      chunkTotal: chunkTotal,
      missingChunkIndices: missingChunkIndices
    )
  }

  return VerifyMissingSelfieDataInstruction(
    requiredTotal: requiredTotal,
    missingSelfieIndexes: missingSelfieIndexes,
    missingChunks: missingChunks
  )
}

nonisolated func parseHelloResponse(
  ackMessage: String?,
  errorCode: String?,
  errorMessage: String?
) -> VerifyHelloResponse? {
  if let code = errorCode, !code.isEmpty {
    return .failure(code: code, message: errorMessage ?? code)
  }

  if ackMessage == "hello_ok" {
    return .success
  }

  return nil
}

nonisolated func isNonRetryableAuthErrorCode(_ code: String) -> Bool {
  switch code {
  case "HELLO_AUTH_REQUIRED",
    "ATTEMPT_NOT_FOUND",
    "HANDOFF_TOKEN_INVALID",
    "HANDOFF_TOKEN_EXPIRED",
    "HANDOFF_TOKEN_CONSUMED",
    "HANDOFF_DEVICE_MISMATCH":
    return true
  default:
    return false
  }
}

nonisolated func shouldRetryReconnect(
  isAuthenticated: Bool,
  lastErrorCode: String?,
  attempt: Int,
  maxAttempts: Int
) -> Bool {
  guard isAuthenticated, attempt > 0, attempt <= maxAttempts else {
    return false
  }

  if let code = lastErrorCode, isNonRetryableAuthErrorCode(code) {
    return false
  }

  return true
}
