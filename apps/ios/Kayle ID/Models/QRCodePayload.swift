import Foundation

/// QR code payload parsed from the `kayle://` URL scheme.
/// This matches the structure defined in `packages/config/src/e2ee-types.ts`.
struct QRCodePayload: Codable {
  let sessionId: String
  let attemptId: String
  let mobileWriteToken: String
  let clientPublicKey: String
  let cryptoVersion: String
  let tokenExp: Int64
  let sig: String

  enum CodingKeys: String, CodingKey {
    case sessionId = "session_id"
    case attemptId = "attempt_id"
    case mobileWriteToken = "mobile_write_token"
    case clientPublicKey = "client_public_key"
    case cryptoVersion = "crypto_version"
    case tokenExp = "token_exp"
    case sig
  }

  /// Parse a QR code payload from a `kayle://` URL.
  static func parse(from urlString: String) throws -> QRCodePayload {
    // Remove the "kayle://" prefix
    guard urlString.hasPrefix("kayle://") else {
      throw QRCodePayloadError.invalidScheme
    }

    let jsonString = String(urlString.dropFirst("kayle://".count))

    guard let data = jsonString.data(using: .utf8) else {
      throw QRCodePayloadError.invalidEncoding
    }

    do {
      return try JSONDecoder().decode(QRCodePayload.self, from: data)
    } catch {
      throw QRCodePayloadError.decodingFailed(error)
    }
  }

  /// Check if the token has expired.
  var isExpired: Bool {
    let now = Int64(Date().timeIntervalSince1970 * 1000)
    return now > tokenExp
  }

  /// Validate the crypto version is supported.
  var isCryptoVersionSupported: Bool {
    cryptoVersion == "ecdh-p256-aes256gcm-v1"
  }
}

enum QRCodePayloadError: LocalizedError {
  case invalidScheme
  case invalidEncoding
  case decodingFailed(Error)
  case tokenExpired
  case unsupportedCryptoVersion

  var errorDescription: String? {
    switch self {
    case .invalidScheme:
      return "Invalid QR code format. Expected kayle:// URL."
    case .invalidEncoding:
      return "Could not decode QR code data."
    case .decodingFailed(let error):
      return "Failed to parse QR code: \(error.localizedDescription)"
    case .tokenExpired:
      return "This QR code has expired. Please scan a new one."
    case .unsupportedCryptoVersion:
      return "Unsupported encryption version. Please update the app."
    }
  }
}
