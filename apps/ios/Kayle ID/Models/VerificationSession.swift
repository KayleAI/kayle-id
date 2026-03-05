import Combine
import Foundation
import SwiftUI

/// The current step in the verification flow.
enum VerificationStep: Int, CaseIterable {
  case welcome        // Landing screen
  case scanning       // Scanning QR code
  case mrz            // Scanning passport MRZ
  case rfidCheck      // Asking if document has RFID (required, no skip)
  case nfc            // Reading NFC chip
  case selfie         // Taking selfie
  case complete       // Verification complete
  case error          // Error state

  var title: String {
    switch self {
    case .welcome: return "Welcome"
    case .scanning: return "Scan QR Code"
    case .mrz: return "Scan Document"
    case .rfidCheck: return "RFID Check"
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
  @Published var step: VerificationStep = .welcome
  @Published var payload: QRCodePayload?
  @Published var errorMessage: String?

  // Captured data
  @Published var mrzResult: MRZResult?
  @Published var nfcResult: PassportReadResult?
  @Published var selfieImages: [UIImage] = []
  @Published var hasRFIDSymbol: Bool?

  // Services
  private var webSocketService: VerifyWebSocketService?
  private var selfieUploadsExpected = 0
  private var selfieSentIndices = Set<Int>()
  private var selfieUploadCancelled = false

  /// Initialize a new session from a scanned QR code payload.
  func initialize(with payload: QRCodePayload) throws {
    // Validate payload
    guard payload.isValid else {
      throw QRCodePayloadError.invalidPayload
    }

    self.payload = payload

    // Construct base URL from session ID environment prefix
    let baseURL = APIService.baseURL(from: payload.sessionId)

    // Initialize services
    self.webSocketService = VerifyWebSocketService(
      sessionId: payload.sessionId,
      attemptId: payload.attemptId,
      mobileWriteToken: payload.mobileWriteToken,
      baseURL: baseURL,
      onFatalError: { [weak self] socketError in
        Task { @MainActor [weak self] in
          self?.handleError(socketError)
        }
      }
    )

    Task {
      do {
        try webSocketService?.connect()
        try await webSocketService?.sendHello()
        await updatePhase(.mobileConnected)
      } catch {
        handleError(error)
      }
    }
  }

  /// Update the current phase on the server.
  func updatePhase(_ phase: AttemptPhase, error: String? = nil) async {
    guard let webSocketService else { return }

    do {
      try await webSocketService.sendPhase(phase, error: error)
    } catch {
      print("Failed to update phase: \(error)")
    }
  }

  /// Upload encrypted data to the relay.
  /// This should be called immediately after each phase completes.
  func uploadData(type: String, data: Data) async throws {
    guard let webSocketService else {
      throw VerificationError.notInitialized
    }

    switch type {
    case "dg1":
      try await webSocketService.sendData(kind: .dg1, raw: data)
    case "dg2":
      try await webSocketService.sendData(kind: .dg2, raw: data)
    case "sod":
      try await webSocketService.sendData(kind: .sod, raw: data)
    default:
      break
    }
  }
  
  /// Upload MRZ data immediately after MRZ scan completes.
  func uploadMRZData() async throws {
    // MRZ data is only used locally for NFC access; no upload needed.
    guard mrzResult != nil else {
      throw VerificationError.notInitialized
    }
  }
  
  /// Upload NFC data immediately after NFC read completes.
  func uploadNFCData() async throws {
    guard let nfcResult = nfcResult else {
      throw VerificationError.notInitialized
    }
    if let dg1 = nfcResult.dataGroups.first(where: { $0.id == 1 }) {
      try await uploadData(type: "dg1", data: dg1.data)
    }
    if let dg2 = nfcResult.dataGroups.first(where: { $0.id == 2 }) {
      try await uploadData(type: "dg2", data: dg2.data)
    }
    if let sod = nfcResult.dataGroups.first(where: { $0.name.contains("SOD") }) {
      try await uploadData(type: "sod", data: sod.data)
    }
  }
  
  /// Upload selfie data immediately after selfie capture completes.
  func uploadSelfieData() async throws {
    guard !selfieImages.isEmpty else {
      throw VerificationError.notInitialized
    }

    let total = selfieImages.count
    for (index, image) in selfieImages.enumerated() {
      _ = try await sendSelfieImage(image, index: index, total: total)
    }
  }

  /// Send a single selfie image immediately after capture.
  func sendSelfieImage(_ image: UIImage, index: Int, total: Int) async throws -> Bool {
    guard let webSocketService else {
      throw VerificationError.notInitialized
    }

    if selfieUploadCancelled {
      throw SelfieError.uploadFailed
    }

    if selfieUploadsExpected == 0 {
      selfieUploadsExpected = total
    }

    if selfieSentIndices.contains(index) {
      return selfieSentIndices.count >= selfieUploadsExpected
    }

    guard let jpeg = image.jpegData(compressionQuality: 0.8) else {
      throw SelfieError.compressionFailed
    }

    try await sendSelfieChunks(
      webSocketService: webSocketService,
      raw: jpeg,
      index: index,
      total: total
    )

    selfieSentIndices.insert(index)
    return selfieSentIndices.count >= selfieUploadsExpected
  }

  /// Move to the next step in the flow.
  func moveToStep(_ newStep: VerificationStep) {
    step = newStep
  }

  /// Handle an error during verification.
  func handleError(_ error: Error) {
    errorMessage = error.localizedDescription
    step = .error
    selfieUploadCancelled = true

    Task {
      await updatePhase(.error, error: error.localizedDescription)
    }
  }

  /// Reset the session for a new verification attempt.
  func reset() {
    webSocketService?.disconnect()
    step = .welcome
    payload = nil
    errorMessage = nil
    mrzResult = nil
    nfcResult = nil
    selfieImages = []
    hasRFIDSymbol = nil
    webSocketService = nil
    selfieUploadsExpected = 0
    selfieSentIndices.removeAll()
    selfieUploadCancelled = false
  }

  private func sendSelfieChunks(
    webSocketService: VerifyWebSocketService,
    raw: Data,
    index: Int,
    total: Int
  ) async throws {
    let chunkSize = 512 * 1024
    let chunkTotal = Int(ceil(Double(raw.count) / Double(chunkSize)))
    if chunkTotal <= 1 {
      if selfieUploadCancelled {
        throw SelfieError.uploadFailed
      }
      try await webSocketService.sendData(
        kind: .selfie,
        raw: raw,
        index: index,
        total: total,
        chunkIndex: 0,
        chunkTotal: 1
      )
      return
    }

    var chunkIndex = 0
    var offset = 0
    while offset < raw.count {
      if selfieUploadCancelled {
        throw SelfieError.uploadFailed
      }
      let end = min(offset + chunkSize, raw.count)
      let chunk = raw.subdata(in: offset..<end)
      try await webSocketService.sendData(
        kind: .selfie,
        raw: chunk,
        index: index,
        total: total,
        chunkIndex: chunkIndex,
        chunkTotal: chunkTotal
      )
      chunkIndex += 1
      offset = end
    }
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
