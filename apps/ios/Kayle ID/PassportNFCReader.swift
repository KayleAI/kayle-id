import Combine
import Foundation
import NFCPassportReader
import UIKit

struct PassportReadResult {
  let mrz: String
  let dg1MRZ: String?
  let dg1Parsed: MRZTD3Result?
  let dataGroups: [PassportDataGroup]
  let passportImage: UIImage?
  let signatureImage: UIImage?
}

struct PassportDataGroup: Identifiable, Equatable {
  let id: Int
  let name: String
  let data: Data
}

final class PassportNFCReader: NSObject, ObservableObject {
  @Published var status: String = "Idle"
  @Published var progress: Int = 0
  @Published var result: PassportReadResult?
  @Published var errorMessage: String?

  private let reader = PassportReader()
  private var currentMRZ: String = ""
  private var currentMRZKey: String = ""
  private var readTask: Task<Void, Never>?

  override init() {
    super.init()
    reader.trackingDelegate = self
  }

  func start(mrz: String) {
    currentMRZ = mrz
    currentMRZKey = ""
    result = nil
    errorMessage = nil
    progress = 0
    status = "Press your passport or ID card against your device and hold still to read the chip."

    do {
      currentMRZKey = try buildMRZKey(from: mrz)
    } catch {
      errorMessage = "MRZ is not valid for NFC."
      status = "Invalid MRZ."
      return
    }

    readTask?.cancel()
    readTask = Task { [weak self] in
      await self?.readPassport()
    }
  }

  private func readPassport() async {
    do {
      let config = PassportReadingConfiguration(
        mrzKey: currentMRZKey,
        dataGroups: [.DG1, .DG2],
        displayMessageHandler: { [weak self] message in
          self?.handleDisplayMessage(message)
          return nil
        }
      )
      let passport = try await reader.readPassport(configuration: config)

      let result = buildResult(from: passport)
      DispatchQueue.main.async {
        self.result = result
        self.progress = 4
        self.status = "Passport read complete."
      }
    } catch {
      DispatchQueue.main.async {
        self.errorMessage = error.localizedDescription
        self.status = "NFC read failed."
      }
    }
  }

  private func handleDisplayMessage(_ message: NFCViewDisplayMessage) {
    switch message {
    case .requestPresentPassport:
      setProgress(0)
      setStatus("Hold your iPhone near your passport.")
    case .authenticatingWithPassport:
      setProgress(2)
      setStatus("Authenticating with passport…")
    case .readingDataGroupProgress:
      setProgress(3)
      setStatus("Reading data groups…")
    case .activeAuthentication:
      setProgress(3)
      setStatus("Authenticating data…")
    case .successfulRead:
      setProgress(4)
      setStatus("Passport read complete.")
    case .error(let error):
      setStatus(error.localizedDescription)
    }
  }

  private func buildResult(from passport: NFCPassportModel) -> PassportReadResult {
    let dg1MRZ = passport.passportMRZ == "NOT FOUND" ? nil : passport.passportMRZ
    let dg1Parsed = dg1MRZ.flatMap { try? MRZTD3.parseAndValidate($0) }

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
      dg1Parsed: dg1Parsed,
      dataGroups: groups,
      passportImage: passport.passportImage,
      signatureImage: passport.signatureImage
    )
  }

  private func buildMRZKey(from mrz: String) throws -> String {
    let lines = MRZTD3.normalise(mrz)
      .split(separator: "\n", omittingEmptySubsequences: true)
      .map(String.init)
    guard lines.count == 2 else { throw PassportNFCError.invalidMRZ }
    let line2 = lines[1]
    guard line2.count >= 28 else { throw PassportNFCError.invalidMRZ }

    let docNumber = String(line2.slice(0, 9))
    let docCheck = line2.char(at: 9)
    let birth = String(line2.slice(13, 19))
    let birthCheck = line2.char(at: 19)
    let expiry = String(line2.slice(21, 27))
    let expiryCheck = line2.char(at: 27)

    return docNumber + String(docCheck) + birth + String(birthCheck) + expiry + String(expiryCheck)
  }

  private func setStatus(_ value: String) {
    DispatchQueue.main.async {
      self.status = value
    }
  }

  private func setProgress(_ value: Int) {
    DispatchQueue.main.async {
      self.progress = value
    }
  }
}

private enum PassportNFCError: Error {
  case invalidMRZ
}

private extension String {
  func char(at index: Int) -> Character {
    self[self.index(self.startIndex, offsetBy: index)]
  }

  func slice(_ start: Int, _ end: Int) -> Substring {
    let s = index(self.startIndex, offsetBy: start)
    let e = index(self.startIndex, offsetBy: end)
    return self[s..<e]
  }

  func chunked(into size: Int) -> [String] {
    guard size > 0 else { return [self] }
    var result: [String] = []
    var start = startIndex
    while start < endIndex {
      let end = index(start, offsetBy: size, limitedBy: endIndex) ?? endIndex
      result.append(String(self[start..<end]))
      start = end
    }
    return result
  }
}

extension Data {
  var base64Lines: String {
    let raw = base64EncodedString()
    return raw.chunked(into: 64).joined(separator: "\n")
  }
}

@available(iOS 15, *)
extension PassportNFCReader: PassportReaderTrackingDelegate {
  func nfcTagDetected() {
    setProgress(1)
    setStatus("Passport detected.")
  }

  func readCardAccess(cardAccess: CardAccess) {
    setStatus("Reading Card Access…")
  }

  func paceStarted() {
    setProgress(2)
    setStatus("Performing PACE authentication…")
  }

  func paceSucceeded() {
    setProgress(2)
    setStatus("PACE succeeded.")
  }

  func paceFailed() {
    setProgress(2)
    setStatus("PACE failed, falling back to BAC…")
  }

  func bacStarted() {
    setProgress(2)
    setStatus("Performing BAC authentication…")
  }

  func bacSucceeded() {
    setProgress(2)
    setStatus("BAC succeeded.")
  }

  func bacFailed() {
    setProgress(2)
    setStatus("BAC failed.")
  }
}
