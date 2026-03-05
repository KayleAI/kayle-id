import Foundation

/// QR code payload parsed from the `kayle-id://` URL scheme.
struct QRCodePayload: Codable {
  let sessionId: String
  let attemptId: String
  let mobileWriteToken: String

  enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case attemptId = "attempt_id"
    case mobileWriteToken = "mobile_write_token"
  }

  /// Parse a QR code payload from a `kayle-id://` URL.
  static func parse(from urlString: String) throws -> QRCodePayload {
    // Remove the scheme prefix.
    let schemePrefixes = ["kayle-id://", "kayle://"]
    guard let prefix = schemePrefixes.first(where: { urlString.hasPrefix($0) }) else {
      throw QRCodePayloadError.invalidScheme
    }

    let jsonString = String(urlString.dropFirst(prefix.count))

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
    !sessionId.isEmpty
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
