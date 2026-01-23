import Combine
import Foundation
import SwiftUI

/// The current step in the verification flow.
enum VerificationStep: Int, CaseIterable {
  case scanning       // Scanning QR code
  case rfidCheck      // Asking if document has RFID (required, no skip)
  case mrz            // Scanning passport MRZ
  case nfc            // Reading NFC chip
  case selfie         // Taking selfie
  case complete       // Verification complete
  case error          // Error state

  var title: String {
    switch self {
    case .scanning: return "Scan QR Code"
    case .rfidCheck: return "RFID Check"
    case .mrz: return "Scan Document"
    case .nfc: return "Read Chip"
    case .selfie: return "Take Selfie"
    case .complete: return "Complete"
    case .error: return "Error"
    }
  }
}

/// Attempt phase values matching the API.
/// These correspond to `AttemptPhase` in `packages/config/src/e2ee-types.ts`.
enum AttemptPhase: String, Codable {
  case initialized = "initialized"
  case mobileConnected = "mobile_connected"
  case mrzScanning = "mrz_scanning"
  case mrzComplete = "mrz_complete"
  case nfcReading = "nfc_reading"
  case nfcComplete = "nfc_complete"
  case selfieCapturing = "selfie_capturing"
  case selfieComplete = "selfie_complete"
  case uploading = "uploading"
  case complete = "complete"
  case error = "error"
}

/// Observable session state for the verification flow.
@MainActor
final class VerificationSession: ObservableObject {
  @Published var step: VerificationStep = .scanning
  @Published var payload: QRCodePayload?
  @Published var errorMessage: String?

  // Captured data
  @Published var mrzResult: MRZResult?
  @Published var nfcResult: PassportReadResult?
  @Published var selfieImages: [UIImage] = []
  @Published var hasRFIDSymbol: Bool?

  // Services
  private var apiService: APIService?
  private var e2eeService: E2EEService?

  /// Initialize a new session from a scanned QR code payload.
  func initialize(with payload: QRCodePayload) throws {
    // Validate payload
    guard !payload.isExpired else {
      throw QRCodePayloadError.tokenExpired
    }

    guard payload.isCryptoVersionSupported else {
      throw QRCodePayloadError.unsupportedCryptoVersion
    }

    self.payload = payload

    // Construct base URL from session ID environment prefix
    let baseURL = APIService.baseURL(from: payload.sessionId)

    // Initialize services
    self.apiService = APIService(
      sessionId: payload.sessionId,
      attemptId: payload.attemptId,
      mobileWriteToken: payload.mobileWriteToken,
      baseURL: baseURL
    )

    self.e2eeService = try E2EEService(clientPublicKeyBase64: payload.clientPublicKey)

    // Notify server that mobile has connected
    Task {
      await updatePhase(.mobileConnected)
    }
  }

  /// Update the current phase on the server.
  func updatePhase(_ phase: AttemptPhase, error: String? = nil) async {
    guard let apiService else { return }

    do {
      try await apiService.updatePhase(phase, error: error)
    } catch {
      print("Failed to update phase: \(error)")
    }
  }

  /// Upload encrypted data to the relay.
  /// This should be called immediately after each phase completes.
  func uploadData(type: String, data: Data) async throws {
    guard let apiService, let e2eeService else {
      throw VerificationError.notInitialized
    }

    let envelope = try e2eeService.encrypt(data)
    try await apiService.uploadData(type: type, envelope: envelope)
  }
  
  /// Upload MRZ data immediately after MRZ scan completes.
  func uploadMRZData() async throws {
    guard let mrzResult = mrzResult else {
      throw VerificationError.notInitialized
    }
    let mrzData = try mrzResult.toUploadData()
    try await uploadData(type: "mrz", data: mrzData)
  }
  
  /// Upload NFC data immediately after NFC read completes.
  func uploadNFCData() async throws {
    guard let nfcResult = nfcResult else {
      throw VerificationError.notInitialized
    }
    let nfcData = try nfcResult.toUploadData()
    try await uploadData(type: "nfc", data: nfcData)
  }
  
  /// Upload selfie data immediately after selfie capture completes.
  func uploadSelfieData() async throws {
    guard !selfieImages.isEmpty else {
      throw VerificationError.notInitialized
    }
    let selfieData = SelfieData(images: selfieImages, capturedAt: Date())
    let data = try selfieData.toUploadData()
    try await uploadData(type: "selfie", data: data)
  }

  /// Move to the next step in the flow.
  func moveToStep(_ newStep: VerificationStep) {
    step = newStep
  }

  /// Handle an error during verification.
  func handleError(_ error: Error) {
    errorMessage = error.localizedDescription
    step = .error

    Task {
      await updatePhase(.error, error: error.localizedDescription)
    }
  }

  /// Reset the session for a new verification attempt.
  func reset() {
    step = .scanning
    payload = nil
    errorMessage = nil
    mrzResult = nil
    nfcResult = nil
    selfieImages = []
    hasRFIDSymbol = nil
    apiService = nil
    e2eeService = nil
  }
}

enum VerificationError: LocalizedError {
  case notInitialized
  case encryptionFailed
  case uploadFailed

  var errorDescription: String? {
    switch self {
    case .notInitialized:
      return "Session not initialized. Please scan a QR code."
    case .encryptionFailed:
      return "Failed to encrypt data."
    case .uploadFailed:
      return "Failed to upload data. Please try again."
    }
  }
}
