import Combine
import Foundation
import MRTDReader
import UIKit

struct PassportReadResult: Equatable {
  let mrz: String
  let dg1MRZ: String?
  let dataGroups: [PassportDataGroup]
  let passportImage: UIImage?
  let signatureImage: UIImage?

  // Parsed fields from MRTDModel
  let firstName: String
  let lastName: String
  let documentNumber: String
  let nationality: String
  let dateOfBirth: String
  let gender: String
  let expiryDate: String
  let issuingAuthority: String
  let documentType: String

  // Custom Equatable - compare document fields, not images
  static func == (lhs: PassportReadResult, rhs: PassportReadResult) -> Bool {
    lhs.mrz == rhs.mrz &&
    lhs.documentNumber == rhs.documentNumber &&
    lhs.firstName == rhs.firstName &&
    lhs.lastName == rhs.lastName
  }

  /// Convert to JSON-encodable Data for E2EE upload.
  func toUploadData() throws -> Data {
    var dict: [String: Any] = [:]

    // DG1 (MRZ from chip)
    if let dg1 = dataGroups.first(where: { $0.id == 1 }) {
      dict["dg1"] = ["raw": dg1.data.base64EncodedString()]
    }

    // DG2 (Face image)
    if let dg2 = dataGroups.first(where: { $0.id == 2 }) {
      var dg2Dict: [String: Any] = ["raw": dg2.data.base64EncodedString()]
      if let image = passportImage, let jpeg = image.jpegData(compressionQuality: 0.8) {
        dg2Dict["faceImage"] = jpeg.base64EncodedString()
      }
      dict["dg2"] = dg2Dict
    }

    // SOD (Security Object Document) - if available
    if let sod = dataGroups.first(where: { $0.name.contains("SOD") }) {
      dict["sod"] = ["raw": sod.data.base64EncodedString()]
    }

    return try JSONSerialization.data(withJSONObject: dict)
  }
}

struct PassportDataGroup: Identifiable, Equatable {
  let id: Int
  let name: String
  let data: Data
}

@MainActor
final class PassportNFCReader: NSObject, ObservableObject {
  @Published var status: String = "Idle"
  @Published var progress: Int = 0
  @Published var result: PassportReadResult?
  @Published var errorMessage: String?

  private let reader = PassportReader()
  private var currentMRZ: String = ""
  private var currentMRZKey: String = ""
  private var currentCardAccessNumber: String?
  private var readTask: Task<Void, Never>?

  nonisolated override init() {
    super.init()
  }

  func setupDelegate() {
    reader.trackingDelegate = self
  }

  /// Start NFC reading with a pre-computed MRZ key (BAC authentication key).
  /// The mrzKey should be: documentNumber + checkDigit + birthDate + checkDigit + expiryDate + checkDigit
  func start(mrzKey: String, cardAccessNumber: String? = nil) {
    // Reset state
    result = nil
    errorMessage = nil
    progress = 0
    status = "Initializing NFC reader..."
    
    // Setup delegate first
    setupDelegate()
    
    currentMRZ = mrzKey
    currentMRZKey = mrzKey
    currentCardAccessNumber = cardAccessNumber

    // Validate MRZ key format (should be around 24 characters: 9+1+6+1+6+1)
    guard mrzKey.count >= 20 else {
      errorMessage = "Invalid MRZ key format. Please scan your document again."
      status = "Scan not valid."
      return
    }

    // Cancel any existing read task
    readTask?.cancel()
    
    // Update status before starting
    status = "Press your document against your device and hold still to read the chip."
    
    // Start reading on a background task
    readTask = Task { [weak self] in
      await self?.readPassport()
    }
  }
  
  /// Start NFC reading by parsing a full MRZ string.
  /// Use this when you have the raw MRZ from the scanner.
  func start(mrz: String, cardAccessNumber: String? = nil) {
    do {
      let mrzKey = try buildMRZKey(from: mrz)
      start(mrzKey: mrzKey, cardAccessNumber: cardAccessNumber)
    } catch {
      result = nil
      errorMessage = "We couldn't use this scan to read the chip. Try scanning again."
      status = "Scan not valid."
    }
  }

  private func readPassport() async {
    do {
      let config = PassportReadingConfiguration(
        mrzKey: currentMRZKey,
        cardAccessNumber: currentCardAccessNumber,
        dataGroups: [.DG1, .DG2],
        displayMessageHandler: { [weak self] message in
          self?.handleDisplayMessage(message)
          return nil
        }
      )
      let passport = try await reader.read(configuration: config)

      let result = buildResult(from: passport)
      self.result = result
      self.progress = 4
      self.status = "Document read complete."
    } catch {
      self.errorMessage = error.localizedDescription
      self.status = "NFC read failed."
    }
  }

  private func handleDisplayMessage(_ message: NFCViewDisplayMessage) {
    // This callback is called from a background thread, so we need to dispatch to main
    Task { @MainActor in
      switch message {
      case .requestPresentPassport:
        self.progress = 0
        self.status = "Hold your iPhone near your document."
      case .authenticatingWithPassport:
        self.progress = 2
        self.status = "Authenticating with document…"
      case .readingDataGroupProgress:
        self.progress = 3
        self.status = "Reading data groups…"
      case .activeAuthentication:
        self.progress = 3
        self.status = "Authenticating data…"
      case .successfulRead:
        self.progress = 4
        self.status = "Document read complete."
      case .error(let error):
        self.status = error.localizedDescription
      }
    }
  }

  private func buildResult(from passport: MRTDModel) -> PassportReadResult {
    let dg1MRZ = passport.passportMRZ == "NOT FOUND" ? nil : passport.passportMRZ

    let groups = passport.dataGroupsRead
      .sorted { $0.key.rawValue < $1.key.rawValue }
      .compactMap { entry -> PassportDataGroup? in
        let data = Data(entry.value.data)
        return PassportDataGroup(
          id: entry.key.rawValue,
          name: entry.key.getName(),
          data: data
        )
      }

    return PassportReadResult(
      mrz: currentMRZ,
      dg1MRZ: dg1MRZ,
      dataGroups: groups,
      passportImage: passport.passportImage,
      signatureImage: passport.signatureImage,
      firstName: passport.firstName,
      lastName: passport.lastName,
      documentNumber: passport.documentNumber,
      nationality: passport.nationality,
      dateOfBirth: passport.dateOfBirth,
      gender: passport.gender,
      expiryDate: passport.documentExpiryDate,
      issuingAuthority: passport.issuingAuthority,
      documentType: passport.documentType
    )
  }

  private func buildMRZKey(from mrz: String) throws -> String {
    let result = try MRZParser.parseAndValidate(mrz)
    return result.mrzKey
  }

}

@available(iOS 15, *)
extension PassportNFCReader: MRTDReaderTrackingDelegate {
  nonisolated func nfcTagDetected() {
    Task { @MainActor in
      self.progress = 1
      self.status = "Document detected."
    }
  }

  nonisolated func readCardAccess(cardAccess: CardAccess) {
    Task { @MainActor in
      self.status = "Reading Card Access…"
    }
  }

  nonisolated func paceStarted() {
    Task { @MainActor in
      self.progress = 2
      self.status = "Performing PACE authentication…"
    }
  }

  nonisolated func paceSucceeded() {
    Task { @MainActor in
      self.progress = 2
      self.status = "PACE succeeded."
    }
  }

  nonisolated func paceFailed() {
    Task { @MainActor in
      self.progress = 2
      self.status = "PACE failed, falling back to BAC…"
    }
  }

  nonisolated func bacStarted() {
    Task { @MainActor in
      self.progress = 2
      self.status = "Performing BAC authentication…"
    }
  }

  nonisolated func bacSucceeded() {
    Task { @MainActor in
      self.progress = 2
      self.status = "BAC succeeded."
    }
  }

  nonisolated func bacFailed() {
    Task { @MainActor in
      self.progress = 2
      self.status = "BAC failed."
    }
  }
}
