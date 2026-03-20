import Foundation

private let qrCodePayloadISO8601WithFractionalSecondsFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [
    .withInternetDateTime,
    .withFractionalSeconds,
  ]
  return formatter
}()

private let qrCodePayloadISO8601Formatter = ISO8601DateFormatter()

func parseQRCodePayloadDate(_ value: String) -> Date? {
  qrCodePayloadISO8601WithFractionalSecondsFormatter.date(from: value) ??
    qrCodePayloadISO8601Formatter.date(from: value)
}

/// QR code payload parsed from the `kayle-id://` URL scheme.
struct QRCodePayload: Codable {
  private static let supportedSchemePrefixes = [
    "kayle-id://",
    "kayle://",
    "kayle-id:",
    "kayle:",
  ]

  let v: Int?
  let sessionId: String
  let attemptId: String
  let mobileWriteToken: String
  let expiresAt: Date

  enum CodingKeys: String, CodingKey {
    case v
    case sessionId = "session_id"
    case attemptId = "attempt_id"
    case mobileWriteToken = "mobile_write_token"
    case expiresAt = "expires_at"
  }

  init(
    v: Int?,
    sessionId: String,
    attemptId: String,
    mobileWriteToken: String,
    expiresAt: Date
  ) {
    self.v = v
    self.sessionId = sessionId
    self.attemptId = attemptId
    self.mobileWriteToken = mobileWriteToken
    self.expiresAt = expiresAt
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    v = try container.decodeIfPresent(Int.self, forKey: .v)
    sessionId = try container.decode(String.self, forKey: .sessionId)
    attemptId = try container.decode(String.self, forKey: .attemptId)
    mobileWriteToken = try container.decode(String.self, forKey: .mobileWriteToken)
    let expiresAtValue = try container.decode(String.self, forKey: .expiresAt)

    guard let parsedExpiresAt = parseQRCodePayloadDate(expiresAtValue) else {
      throw DecodingError.dataCorruptedError(
        forKey: .expiresAt,
        in: container,
        debugDescription: "expires_at must be a valid ISO-8601 timestamp."
      )
    }

    expiresAt = parsedExpiresAt
  }

  /// Parse a QR code payload from a `kayle-id://` URL.
  static func parse(from urlString: String) throws -> QRCodePayload {
    guard
      let prefix = supportedSchemePrefixes.first(where: { urlString.hasPrefix($0) })
    else {
      throw QRCodePayloadError.invalidScheme
    }

    let payloadString = String(urlString.dropFirst(prefix.count))
      .trimmingCharacters(in: .whitespacesAndNewlines)

    let normalizedPayload: String
    if payloadString.hasPrefix("/") {
      normalizedPayload = String(payloadString.dropFirst())
    } else {
      normalizedPayload = payloadString
    }

    let jsonString = normalizedPayload.removingPercentEncoding ?? normalizedPayload

    guard let data = jsonString.data(using: .utf8) else {
      throw QRCodePayloadError.invalidEncoding
    }

    do {
      return try JSONDecoder().decode(QRCodePayload.self, from: data)
    } catch {
      throw QRCodePayloadError.decodingFailed(error)
    }
  }

  /// Validate that the payload includes required fields.
  var isValid: Bool {
    let expirySkewToleranceSeconds = 30.0

    return !sessionId.isEmpty &&
      !attemptId.isEmpty &&
      !mobileWriteToken.isEmpty &&
      expiresAt.timeIntervalSinceNow >= -expirySkewToleranceSeconds
  }
}

enum QRCodePayloadError: LocalizedError {
  case invalidScheme
  case invalidEncoding
  case decodingFailed(Error)
  case invalidPayload

  var errorDescription: String? {
    switch self {
    case .invalidScheme:
      return "Invalid QR code format. Expected kayle-id:// URL."
    case .invalidEncoding:
      return "Could not decode QR code data."
    case .decodingFailed(let error):
      return "Failed to parse QR code: \(error.localizedDescription)"
    case .invalidPayload:
      return "Invalid QR code payload."
    }
  }
}
