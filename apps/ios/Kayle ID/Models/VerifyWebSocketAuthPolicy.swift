import Foundation

nonisolated private func shareFieldDisplayName(_ key: String) -> String? {
  switch key {
  case "document_type_code":
    return "Document Type Code"
  case "issuing_country_code":
    return "Issuing Country Code"
  case "family_name":
    return "Family Name"
  case "given_names":
    return "Given Names"
  case "document_number":
    return "Document Number"
  case "nationality_code":
    return "Nationality Code"
  case "date_of_birth":
    return "Date of Birth"
  case "sex_marker":
    return "Sex Marker"
  case "document_expiry_date":
    return "Expiry Date"
  case "mrz_optional_data":
    return "MRZ Optional Data"
  case "document_photo":
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

struct VerifySharePreviewContext: Equatable {
  let birthDate: String?
  let documentNumber: String?
  let documentType: String?
  let expiryDate: String?
  let givenNames: String?
  let issuingCountry: String?
  let nationality: String?
  let optionalData: String?
  let sex: String?
  let surname: String?
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
      isShareFieldSelectionLocked(field) ? field.key : nil
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
    selectedShareFieldKeys.contains(field.key) || isShareFieldSelectionLocked(field)
      ? field.key
      : nil
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
    field.required && !isKayleShareField(field.key) ? field.key : nil
  }

  return requiredKeys.allSatisfy(selectedShareFieldKeys.contains)
}

nonisolated func isShareFieldSelectionLocked(_ field: VerifyShareRequestField) -> Bool {
  isKayleShareField(field.key)
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

nonisolated private func isAsciiDigit(_ character: Character) -> Bool {
  character >= "0" && character <= "9"
}

nonisolated private func isISODateText(_ value: String) -> Bool {
  let characters = Array(value)
  guard characters.count == 10 else {
    return false
  }

  for index in [0, 1, 2, 3, 5, 6, 8, 9] {
    if !isAsciiDigit(characters[index]) {
      return false
    }
  }

  return characters[4] == "-" && characters[7] == "-"
}

nonisolated private func isCompactDigitDateText(_ value: String, expectedCount: Int) -> Bool {
  value.count == expectedCount && value.allSatisfy(isAsciiDigit)
}

nonisolated private func parseFourDigitYearDate(_ value: String) -> Date? {
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)

  if isISODateText(trimmed) {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.date(from: trimmed)
  }

  if isCompactDigitDateText(trimmed, expectedCount: 8) {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyyMMdd"
    return formatter.date(from: trimmed)
  }

  return nil
}

nonisolated private func resolveMRZYear(
  yearSuffix: Int,
  yearRange: ClosedRange<Int>
) -> Int? {
  let baseCentury = (yearRange.upperBound / 100) * 100
  let candidates = [
    baseCentury - 100 + yearSuffix,
    baseCentury + yearSuffix,
    baseCentury + 100 + yearSuffix,
  ]

  return candidates
    .filter { yearRange.contains($0) }
    .sorted()
    .last
}

nonisolated private func parseMRZDate(
  _ value: String,
  yearRange: ClosedRange<Int>
) -> Date? {
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
  guard isCompactDigitDateText(trimmed, expectedCount: 6) else {
    return nil
  }

  guard
    let yearSuffix = Int(trimmed.prefix(2)),
    let month = Int(trimmed.dropFirst(2).prefix(2)),
    let day = Int(trimmed.suffix(2)),
    let year = resolveMRZYear(yearSuffix: yearSuffix, yearRange: yearRange)
  else {
    return nil
  }

  var components = DateComponents()
  components.calendar = Calendar(identifier: .gregorian)
  components.timeZone = TimeZone(secondsFromGMT: 0)
  components.year = year
  components.month = month
  components.day = day
  return components.date
}

nonisolated private func formatDisplayDate(_ value: String, key: String) -> String? {
  let nowYear = Calendar(identifier: .gregorian).component(.year, from: Date())
  let parsedDate =
    parseFourDigitYearDate(value)
    ?? {
      if key == "date_of_birth" {
        return parseMRZDate(value, yearRange: (nowYear - 130)...nowYear)
      }

      if key == "document_expiry_date" {
        return parseMRZDate(value, yearRange: (nowYear - 50)...(nowYear + 50))
      }

      return nil
    }()

  guard let parsedDate else {
    return nil
  }

  let formatter = DateFormatter()
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.locale = Locale(identifier: "en_GB")
  formatter.timeZone = TimeZone(secondsFromGMT: 0)
  formatter.dateFormat = "dd/MM/yyyy"
  return formatter.string(from: parsedDate)
}

nonisolated private func formatSex(_ value: String) -> String {
  switch value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() {
  case "M":
    return "Male"
  case "F":
    return "Female"
  case "X":
    return "Unspecified"
  default:
    return value
  }
}

nonisolated func shareFieldDetailText(
  _ field: VerifyShareRequestField,
  previewContext: VerifySharePreviewContext?
) -> String {
  let key = field.key

  switch key {
  case "document_type_code":
    return previewContext?.documentType ?? "Verified from your document."
  case "issuing_country_code":
    return previewContext?.issuingCountry ?? "Verified from your document."
  case "family_name":
    return previewContext?.surname ?? "Verified from your document."
  case "given_names":
    return previewContext?.givenNames ?? "Verified from your document."
  case "document_number":
    return previewContext?.documentNumber ?? "Verified from your document."
  case "nationality_code":
    return previewContext?.nationality ?? "Verified from your document."
  case "date_of_birth":
    if
      let birthDate = previewContext?.birthDate,
      let formattedDate = formatDisplayDate(birthDate, key: key)
    {
      return formattedDate
    }
    return previewContext?.birthDate ?? "Verified from your document."
  case "sex_marker":
    if let sex = previewContext?.sex {
      return formatSex(sex)
    }
    return "Verified from your document."
  case "document_expiry_date":
    if
      let expiryDate = previewContext?.expiryDate,
      let formattedDate = formatDisplayDate(expiryDate, key: key)
    {
      return formattedDate
    }
    return previewContext?.expiryDate ?? "Verified from your document."
  case "mrz_optional_data":
    return previewContext?.optionalData ?? "Additional machine-readable document data."
  case "document_photo":
    return "Photo securely read from your document chip."
  case "kayle_document_id":
    return "Required security identifier for this verified document."
  case "kayle_human_id":
    return "Reserved placeholder for a future human identifier."
  default:
    if let suffix = key.split(separator: "_").last, key.hasPrefix("age_over_") {
      return "Verified as over \(suffix)."
    }

    return field.reason
  }
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
