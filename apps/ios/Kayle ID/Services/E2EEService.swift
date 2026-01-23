import CryptoKit
import Foundation
import Security

/// E2EE envelope structure matching `packages/config/src/e2ee-types.ts`.
struct E2EEEnvelope: Codable {
  let ephemeralPublicKey: String
  let iv: String
  let ciphertext: String
}

/// End-to-end encryption service using ECDH P-256 + AES-256-GCM.
/// Matches the crypto implementation in `apps/api/src/functions/e2ee.ts`.
final class E2EEService {
  private let clientPublicKey: P256.KeyAgreement.PublicKey

  /// Initialize with the client's base64url-encoded ECDH P-256 public key.
  /// The key is expected to be in raw format (65 bytes: 0x04 + 32 bytes X + 32 bytes Y)
  /// as exported by the browser's Web Crypto API using "raw" format.
  init(clientPublicKeyBase64: String) throws {
    let keyData = try Self.base64URLDecode(clientPublicKeyBase64)
    
    // Try multiple approaches to import the key
    // 1. Try rawRepresentation directly (most common case)
    if let key = try? P256.KeyAgreement.PublicKey(rawRepresentation: keyData) {
      self.clientPublicKey = key
      return
    }
    
    // 2. Try x963Representation (ANSI X9.63 format, same as raw for uncompressed)
    if let key = try? P256.KeyAgreement.PublicKey(x963Representation: keyData) {
      self.clientPublicKey = key
      return
    }
    
    // 3. Try using Security framework as intermediary
    // Note: SecKeyCreateWithData might not accept raw format directly,
    // so we'll try to create it and then export it back
    do {
      let secKey = try Self.importKeyViaSecurityFramework(keyData)
      self.clientPublicKey = try Self.convertSecKeyToCryptoKit(secKey)
      return
    } catch {
      // If all methods fail, provide a helpful error
      throw E2EEError.keyImportFailed("Unable to import public key. Key data length: \(keyData.count) bytes, first byte: 0x\(String(keyData[0], radix: 16))")
    }
  }
  
  /// Import a raw EC public key using Security framework.
  private static func importKeyViaSecurityFramework(_ keyData: Data) throws -> SecKey {
    // Create attributes for P-256 EC public key
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeyClass as String: kSecAttrKeyClassPublic,
      kSecAttrKeySizeInBits as String: 256,
    ]
    
    var error: Unmanaged<CFError>?
    guard let secKey = SecKeyCreateWithData(keyData as CFData, attributes as CFDictionary, &error) else {
      if let error = error?.takeRetainedValue() {
        throw E2EEError.keyImportFailed(error.localizedDescription)
      }
      throw E2EEError.invalidBase64
    }
    
    return secKey
  }
  
  /// Convert a SecKey to CryptoKit's P256.KeyAgreement.PublicKey.
  private static func convertSecKeyToCryptoKit(_ secKey: SecKey) throws -> P256.KeyAgreement.PublicKey {
    // Export the key - SecKeyCopyExternalRepresentation returns X9.63 format for EC keys
    // which is the same as raw format (0x04 + X + Y) for uncompressed points
    var error: Unmanaged<CFError>?
    guard let keyData = SecKeyCopyExternalRepresentation(secKey, &error) as Data? else {
      if let error = error?.takeRetainedValue() {
        throw E2EEError.keyImportFailed(error.localizedDescription)
      }
      throw E2EEError.invalidBase64
    }
    
    // Try rawRepresentation first (X9.63 format is compatible)
    do {
      return try P256.KeyAgreement.PublicKey(rawRepresentation: keyData)
    } catch {
      // If that fails, try x963Representation
      return try P256.KeyAgreement.PublicKey(x963Representation: keyData)
    }
  }

  /// Encrypt data using ECDH key exchange and AES-256-GCM.
  func encrypt(_ plaintext: Data) throws -> E2EEEnvelope {
    // 1. Generate ephemeral keypair
    let ephemeralKey = P256.KeyAgreement.PrivateKey()

    // 2. Perform ECDH key agreement
    let sharedSecret = try ephemeralKey.sharedSecretFromKeyAgreement(with: clientPublicKey)

    // 3. Derive symmetric key using HKDF-SHA256
    // Match the desktop implementation: empty salt, empty info
    let symmetricKey = sharedSecret.hkdfDerivedSymmetricKey(
      using: SHA256.self,
      salt: Data(),
      sharedInfo: Data(),
      outputByteCount: 32
    )

    // 4. Generate random 12-byte IV for AES-GCM
    let nonce = AES.GCM.Nonce()

    // 5. Encrypt with AES-256-GCM
    let sealedBox = try AES.GCM.seal(plaintext, using: symmetricKey, nonce: nonce)

    // 6. Combine ciphertext and authentication tag
    // GCM tag is 16 bytes, appended to ciphertext
    let ciphertextWithTag = sealedBox.ciphertext + sealedBox.tag

    return E2EEEnvelope(
      ephemeralPublicKey: Self.base64URLEncode(ephemeralKey.publicKey.rawRepresentation),
      iv: Self.base64URLEncode(Data(nonce)),
      ciphertext: Self.base64URLEncode(ciphertextWithTag)
    )
  }

  // MARK: - Base64URL Encoding/Decoding

  /// Decode base64url string to Data.
  private static func base64URLDecode(_ string: String) throws -> Data {
    // Convert base64url to standard base64
    var base64 = string
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")

    // Add padding if needed
    let remainder = base64.count % 4
    if remainder > 0 {
      base64 += String(repeating: "=", count: 4 - remainder)
    }

    guard let data = Data(base64Encoded: base64) else {
      throw E2EEError.invalidBase64
    }

    return data
  }

  /// Encode Data to base64url string.
  private static func base64URLEncode(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

enum E2EEError: LocalizedError {
  case invalidBase64
  case encryptionFailed
  case keyAgreementFailed
  case keyImportFailed(String)

  var errorDescription: String? {
    switch self {
    case .invalidBase64:
      return "Invalid encryption key format."
    case .encryptionFailed:
      return "Failed to encrypt data."
    case .keyAgreementFailed:
      return "Failed to establish secure connection."
    case .keyImportFailed(let message):
      return "Failed to import public key: \(message)"
    }
  }
}
