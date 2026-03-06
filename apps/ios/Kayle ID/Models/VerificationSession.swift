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
  private let nfcChunkSize = 512 * 1024

  private struct NFCUploadPlan {
    let kind: VerifyDataKind
    let chunks: [Data]
  }

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
    guard let nfcResult else {
      throw VerificationError.notInitialized
    }
    guard let webSocketService else {
      throw VerificationError.notInitialized
    }

    let plans = try buildNFCUploadPlans(from: nfcResult)

    while true {
      do {
        for plan in plans {
          try await uploadNFCPlan(plan, via: webSocketService)
        }

        try await completeNFCPhase(plans: plans, via: webSocketService)
        return
      } catch let socketError as VerifyWebSocketError {
        switch socketError {
        case .connectionClosed, .notConnected, .reconnectFailed, .serverResponseTimedOut:
          try await Task.sleep(nanoseconds: 300_000_000)
          continue
        default:
          throw socketError
        }
      }
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

  private func buildNFCUploadPlans(from result: PassportReadResult) throws -> [NFCUploadPlan] {
    guard let dg1 = result.dataGroups.first(where: { $0.id == 0x61 }) else {
      throw VerificationError.missingRequiredNFCData("DG1")
    }

    guard let dg2 = result.dataGroups.first(where: { $0.id == 0x75 }) else {
      throw VerificationError.missingRequiredNFCData("DG2")
    }

    guard let sod = result.dataGroups.first(where: { $0.id == 0x77 }) else {
      throw VerificationError.missingRequiredNFCData("SOD")
    }

    return [
      NFCUploadPlan(kind: .dg1, chunks: chunkData(dg1.data, chunkSize: nfcChunkSize)),
      NFCUploadPlan(kind: .dg2, chunks: chunkData(dg2.data, chunkSize: nfcChunkSize)),
      NFCUploadPlan(kind: .sod, chunks: chunkData(sod.data, chunkSize: nfcChunkSize)),
    ]
  }

  private func chunkData(_ raw: Data, chunkSize: Int) -> [Data] {
    if raw.count <= chunkSize {
      return [raw]
    }

    var chunks: [Data] = []
    var offset = 0

    while offset < raw.count {
      let end = min(offset + chunkSize, raw.count)
      chunks.append(raw.subdata(in: offset..<end))
      offset = end
    }

    return chunks
  }

  private func uploadNFCPlan(
    _ plan: NFCUploadPlan,
    via webSocketService: VerifyWebSocketService,
    startingAt startChunkIndex: Int = 0
  ) async throws {
    guard !plan.chunks.isEmpty else {
      throw VerificationError.uploadFailed
    }

    let clampedStartChunkIndex = max(0, min(startChunkIndex, plan.chunks.count - 1))
    var nextChunkIndex = clampedStartChunkIndex
    let chunkTotal = plan.chunks.count

    while nextChunkIndex < chunkTotal {
      let chunk = plan.chunks[nextChunkIndex]

      do {
        let response = try await webSocketService.sendDataAwaitResponse(
          kind: plan.kind,
          raw: chunk,
          index: 0,
          total: 1,
          chunkIndex: nextChunkIndex,
          chunkTotal: chunkTotal
        )

        guard
          isExpectedDataAck(
            ackMessage: response.ackMessage,
            kind: plan.kind.rawValue,
            index: 0,
            chunkIndex: nextChunkIndex,
            chunkTotal: chunkTotal
          )
        else {
          throw VerifyWebSocketError.sendFailed
        }

        nextChunkIndex += 1
      } catch let socketError as VerifyWebSocketError {
        guard case .serverError(let code, let message) = socketError else {
          throw socketError
        }

        guard
          let retryInstruction = parseChunkRetryInstruction(
            errorCode: code,
            errorMessage: message
          ),
          retryInstruction.kind == plan.kind.rawValue,
          retryInstruction.index == 0,
          retryInstruction.chunkIndex >= 0,
          retryInstruction.chunkIndex < chunkTotal
        else {
          throw socketError
        }

        nextChunkIndex = retryInstruction.chunkIndex
      }
    }
  }

  private func completeNFCPhase(
    plans: [NFCUploadPlan],
    via webSocketService: VerifyWebSocketService
  ) async throws {
    while true {
      do {
        let response = try await webSocketService.sendPhaseAwaitResponse(
          .nfcComplete,
          error: nil
        )

        guard response.ackMessage == "phase_ok" else {
          throw VerifyWebSocketError.sendFailed
        }
        return
      } catch let socketError as VerifyWebSocketError {
        guard case .serverError(let code, let message) = socketError else {
          throw socketError
        }

        guard
          let missingInstruction = parseMissingNFCDataInstruction(
            errorCode: code,
            errorMessage: message
          )
        else {
          throw socketError
        }

        try await resendMissingNFCData(
          missingInstruction,
          plans: plans,
          via: webSocketService
        )
      }
    }
  }

  private func resendMissingNFCData(
    _ missingInstruction: VerifyMissingNFCDataInstruction,
    plans: [NFCUploadPlan],
    via webSocketService: VerifyWebSocketService
  ) async throws {
    let plansByKind = Dictionary(uniqueKeysWithValues: plans.map { ($0.kind.rawValue, $0) })

    for artifact in missingInstruction.missingArtifacts {
      guard
        let kind = parseNFCArtifactKind(artifact),
        let plan = plansByKind[kind.rawValue]
      else {
        continue
      }

      try await uploadNFCPlan(plan, via: webSocketService)
    }

    for missingChunk in missingInstruction.missingChunks {
      guard let plan = plansByKind[missingChunk.kind] else {
        continue
      }

      let missingChunkIndices = missingChunk.missingChunkIndices.sorted()
      if missingChunkIndices.isEmpty {
        continue
      }

      for chunkIndex in missingChunkIndices {
        guard chunkIndex >= 0, chunkIndex < plan.chunks.count else {
          continue
        }

        try await uploadNFCPlan(
          plan,
          via: webSocketService,
          startingAt: chunkIndex
        )
      }
    }
  }

  private func parseNFCArtifactKind(_ artifact: String) -> VerifyDataKind? {
    switch artifact {
    case "dg1":
      return .dg1
    case "dg2":
      return .dg2
    case "sod":
      return .sod
    default:
      return nil
    }
  }
}

enum VerificationError: LocalizedError {
  case notInitialized
  case encryptionFailed
  case uploadFailed
  case missingRequiredNFCData(String)

  var errorDescription: String? {
    switch self {
    case .notInitialized:
      return "Session not initialized. Please scan a QR code."
    case .encryptionFailed:
      return "Failed to encrypt data."
    case .uploadFailed:
      return "Failed to upload data. Please try again."
    case .missingRequiredNFCData(let dataGroup):
      return "Missing \(dataGroup) from NFC read. Please scan your passport chip again."
    }
  }
}
