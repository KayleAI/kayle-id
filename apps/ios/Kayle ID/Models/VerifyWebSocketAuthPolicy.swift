import Foundation

nonisolated private func shareFieldDisplayName(_ key: String) -> String? {
  switch key {
  case "dg1_document_type":
    return "Document Type"
  case "dg1_issuing_country":
    return "Issuing Country"
  case "dg1_surname":
    return "Surname"
  case "dg1_given_names":
    return "Given Names"
  case "dg1_document_number":
    return "Document Number"
  case "dg1_nationality":
    return "Nationality"
  case "dg1_date_of_birth":
    return "Date of Birth"
  case "dg1_sex":
    return "Sex"
  case "dg1_expiry_date":
    return "Expiry Date"
  case "dg1_optional_data":
    return "Additional Document Data"
  case "dg2_face_image":
    return "Document Photo"
  case "kayle_document_id":
    return "Kayle Document ID"
  case "kayle_human_id":
    return "Kayle Human ID"
  default:
    return nil
  }
}

enum VerifyHelloResponse: Equatable {
  case success
  case failure(code: String, message: String)
}

enum VerifyVerdictOutcome: Equatable {
  case accepted
  case rejected
}

struct VerifyServerVerdict: Equatable {
  let outcome: VerifyVerdictOutcome
  let reasonCode: String
  let reasonMessage: String
  let retryAllowed: Bool
  let remainingAttempts: Int
}

struct VerifyShareRequestField: Equatable, Identifiable {
  let key: String
  let reason: String
  let required: Bool

  var id: String {
    key
  }
}

struct VerifyShareRequest: Equatable {
  let contractVersion: Int
  let sessionId: String
  let fields: [VerifyShareRequestField]
}

struct VerifyShareReady: Equatable {
  let sessionId: String
  let selectedFieldKeys: [String]
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

nonisolated func isExpectedPhaseAck(_ ackMessage: String?) -> Bool {
  ackMessage == "phase_ok"
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

nonisolated func isAcceptedVerdict(_ verdict: VerifyServerVerdict?) -> Bool {
  guard let verdict else {
    return false
  }

  switch verdict.outcome {
  case .accepted:
    return true
  case .rejected:
    return false
  }
}

nonisolated func isRejectedVerdict(_ verdict: VerifyServerVerdict?) -> Bool {
  guard let verdict else {
    return false
  }

  switch verdict.outcome {
  case .accepted:
    return false
  case .rejected:
    return true
  }
}

nonisolated func shouldSuppressReconnectAfterHandledVerdict(
  _ verdict: VerifyServerVerdict?
) -> Bool {
  isRejectedVerdict(verdict)
}

nonisolated func defaultSelectedShareFieldKeys(
  _ shareRequest: VerifyShareRequest?
) -> Set<String> {
  guard let shareRequest else {
    return []
  }

  return Set(
    shareRequest.fields.compactMap { field in
      field.required ? field.key : nil
    }
  )
}

nonisolated func orderedSelectedShareFieldKeys(
  shareRequest: VerifyShareRequest?,
  selectedShareFieldKeys: Set<String>
) -> [String] {
  guard let shareRequest else {
    return []
  }

  return shareRequest.fields.compactMap { field in
    selectedShareFieldKeys.contains(field.key) ? field.key : nil
  }
}

nonisolated func isShareSelectionSubmittable(
  shareRequest: VerifyShareRequest?,
  selectedShareFieldKeys: Set<String>
) -> Bool {
  guard let shareRequest else {
    return false
  }

  let requiredKeys = shareRequest.fields.compactMap { field in
    field.required ? field.key : nil
  }

  return requiredKeys.allSatisfy(selectedShareFieldKeys.contains)
}

nonisolated func isKayleShareField(_ key: String) -> Bool {
  key.hasPrefix("kayle_")
}

nonisolated func kayleShareRequestFields(
  _ shareRequest: VerifyShareRequest?
) -> [VerifyShareRequestField] {
  guard let shareRequest else {
    return []
  }

  return shareRequest.fields.filter { field in
    isKayleShareField(field.key)
  }
}

nonisolated func requiredShareRequestFields(
  _ shareRequest: VerifyShareRequest?
) -> [VerifyShareRequestField] {
  guard let shareRequest else {
    return []
  }

  return shareRequest.fields.filter { field in
    field.required && !isKayleShareField(field.key)
  }
}

nonisolated func optionalShareRequestFields(
  _ shareRequest: VerifyShareRequest?
) -> [VerifyShareRequestField] {
  guard let shareRequest else {
    return []
  }

  return shareRequest.fields.filter { field in
    !field.required && !isKayleShareField(field.key)
  }
}

nonisolated func displayNameForShareField(_ key: String) -> String {
  if let displayName = shareFieldDisplayName(key) {
    return displayName
  }

  if let suffix = key.split(separator: "_").last, key.hasPrefix("age_over_") {
    return "Over \(suffix)"
  }

  return key
    .split(separator: "_")
    .map { segment in
      if segment == "id" {
        return "ID"
      }

      return segment.prefix(1).uppercased() + segment.dropFirst()
    }
    .joined(separator: " ")
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
