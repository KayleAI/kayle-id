import Combine
import CoreNFC
import Foundation
import CommonCrypto

struct PassportReadResult: Equatable {
  let mrz: String
  let dg1MRZ: String?
  let dg1Parsed: MRZTD3Result?
  let dataGroups: [PassportDataGroup]
}

struct PassportDataGroup: Identifiable, Equatable {
  let id: Int
  let name: String
  let data: Data
}

final class PassportNFCReader: NSObject, ObservableObject, NFCTagReaderSessionDelegate {
  @Published var status: String = "Idle"
  @Published var progress: Int = 0
  @Published var result: PassportReadResult?
  @Published var errorMessage: String?

  private var session: NFCTagReaderSession?
  private var currentMRZ: String = ""
  private let workQueue = DispatchQueue(label: "passport.nfc.reader")

  func start(mrz: String) {
    guard NFCTagReaderSession.readingAvailable else {
      setError("NFC is not available on this device.")
      return
    }

    currentMRZ = mrz
    result = nil
    errorMessage = nil
    progress = 0
    status = "Hold your iPhone near the passport chip."

    guard let session = NFCTagReaderSession(pollingOption: [.iso14443], delegate: self, queue: nil) else {
      setError("Unable to start NFC session.")
      return
    }
    session.alertMessage = "Hold your iPhone near the passport."
    self.session = session
    session.begin()
  }

  func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {
    setStatus("Scanning for passport chip…")
  }

  func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
    setStatus("Idle")
    let nsError = error as NSError
    let userCanceled =
      nsError.domain == NFCReaderError.errorDomain &&
      nsError.code == NFCReaderError.Code.readerSessionInvalidationErrorUserCanceled.rawValue
    if !userCanceled {
      setError(error.localizedDescription)
    }
  }

  func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
    guard let first = tags.first else {
      session.restartPolling()
      return
    }

    if tags.count > 1 {
      session.alertMessage = "More than one tag detected. Please present only one passport."
      session.restartPolling()
      return
    }

    guard case let .iso7816(tag) = first else {
      session.alertMessage = "Unsupported tag type."
      session.invalidate()
      return
    }

    session.connect(to: first) { [weak self] error in
      guard let self else { return }
      if let error {
        self.setError(error.localizedDescription)
        session.invalidate(errorMessage: "Failed to connect to the passport.")
        return
      }

      self.workQueue.async {
        self.readPassport(tag: tag, session: session)
      }
    }
  }

  private func readPassport(tag: NFCISO7816Tag, session: NFCTagReaderSession) {
    do {
      setProgress(1)
      setStatus("Selecting eMRTD applet…")

      try selectApplet(tag: tag)

      setProgress(2)
      setStatus("Performing BAC authentication…")

      var sm = try performBAC(tag: tag, mrz: currentMRZ)

      setProgress(3)
      setStatus("Reading data groups…")

      let efCom = try readFile(tag: tag, sm: &sm, fileId: Data([0x01, 0x1E]), label: "EF.COM")
      let dgTags = parseDataGroupTags(from: efCom)

      var groups: [PassportDataGroup] = []
      groups.append(PassportDataGroup(id: 0, name: "EF.COM", data: efCom))

      var dg1MRZ: String? = nil
      var dg1Parsed: MRZTD3Result? = nil

      for tagValue in dgTags {
        if let fileId = fileIdForDataGroupTag(tagValue) {
          let name = dataGroupName(tagValue)
          let data = try readFile(tag: tag, sm: &sm, fileId: fileId, label: name)
          groups.append(PassportDataGroup(id: Int(tagValue), name: name, data: data))

          if tagValue == 0x61 {
            dg1MRZ = extractMRZFromDG1(data)
            if let dg1MRZ {
              dg1Parsed = try? MRZTD3.parseAndValidate(dg1MRZ)
            }
          }
        }
      }

      // Attempt EF.SOD for completeness.
      if let sod = try? readFile(tag: tag, sm: &sm, fileId: Data([0x01, 0x1D]), label: "EF.SOD") {
        groups.append(PassportDataGroup(id: 99, name: "EF.SOD", data: sod))
      }

      let result = PassportReadResult(
        mrz: currentMRZ,
        dg1MRZ: dg1MRZ,
        dg1Parsed: dg1Parsed,
        dataGroups: groups
      )

      DispatchQueue.main.async {
        self.result = result
        self.progress = 4
        self.status = "Passport read complete."
        session.alertMessage = "Passport read complete."
        session.invalidate()
      }
    } catch {
      DispatchQueue.main.async {
        self.errorMessage = error.localizedDescription
        self.status = "NFC read failed."
        session.invalidate(errorMessage: "NFC read failed.")
      }
    }
  }

  // MARK: - NFC / BAC

  private func selectApplet(tag: NFCISO7816Tag) throws {
    let aid = Data([0xA0, 0x00, 0x00, 0x02, 0x47, 0x10, 0x01])
    let command = CommandAPDU(cla: 0x00, ins: 0xA4, p1: 0x04, p2: 0x0C, data: aid, le: nil)
    _ = try send(command, to: tag)
  }

  private func performBAC(tag: NFCISO7816Tag, mrz: String) throws -> SecureMessaging {
    let keys = try BACKeys(mrz: mrz)

    let challenge = CommandAPDU(cla: 0x00, ins: 0x84, p1: 0x00, p2: 0x00, data: Data(), le: 0x08)
    let challengeResp = try send(challenge, to: tag)
    guard challengeResp.data.count == 8 else {
      throw PassportNFCError.invalidChallenge
    }

    let rndICC = challengeResp.data
    let rndIFD = try randomBytes(count: 8)
    let kIFD = try randomBytes(count: 16)

    let s = rndIFD + rndICC + kIFD
    let eIFD = try tripleDESEncrypt(s, key: keys.kEnc)
    let mac = try retailMac(message: eIFD, key: keys.kMac)
    let authData = eIFD + mac

    let auth = CommandAPDU(cla: 0x00, ins: 0x82, p1: 0x00, p2: 0x00, data: authData, le: 0x00)
    let authResp = try send(auth, to: tag)

    guard authResp.data.count >= 40 else {
      throw PassportNFCError.invalidMutualAuth
    }

    let responseData = authResp.data
    let eICC = responseData.prefix(32)
    let respMac = responseData.suffix(8)
    let expectedMac = try retailMac(message: eICC, key: keys.kMac)
    guard respMac == expectedMac else {
      throw PassportNFCError.invalidMutualAuth
    }

    let sICC = try tripleDESDecrypt(Data(eICC), key: keys.kEnc)
    guard sICC.count == 32 else {
      throw PassportNFCError.invalidMutualAuth
    }

    let rndICC2 = sICC.prefix(8)
    let rndIFD2 = sICC.subdata(in: 8..<16)
    let kICC = sICC.subdata(in: 16..<32)

    guard rndIFD2 == rndIFD else {
      throw PassportNFCError.invalidMutualAuth
    }

    let seed = xorData(kIFD, kICC)
    let ksEnc = try BACKeys.deriveKey(seed: seed, counter: 0x00000001)
    let ksMac = try BACKeys.deriveKey(seed: seed, counter: 0x00000002)

    let ssc = rndICC2.suffix(4) + rndIFD.suffix(4)

    return SecureMessaging(ksEnc: ksEnc, ksMac: ksMac, ssc: ssc)
  }

  private func readFile(tag: NFCISO7816Tag, sm: inout SecureMessaging, fileId: Data, label: String) throws -> Data {
    let select = CommandAPDU(cla: 0x00, ins: 0xA4, p1: 0x02, p2: 0x0C, data: fileId, le: nil)
    _ = try send(select, to: tag, sm: &sm)

    let headerChunk = try readBinary(tag: tag, sm: &sm, offset: 0, length: 0xFF)
    let header = try TLVHeader.parse(from: headerChunk)
    let totalLength = header.valueOffset + header.length

    var data = headerChunk
    var offset = data.count

    while data.count < totalLength {
      let remaining = totalLength - data.count
      let chunkLength = min(remaining, 0xFF)
      let chunk = try readBinary(tag: tag, sm: &sm, offset: offset, length: chunkLength)
      data.append(chunk)
      offset += chunk.count
    }

    return data
  }

  private func readBinary(tag: NFCISO7816Tag, sm: inout SecureMessaging, offset: Int, length: Int) throws -> Data {
    let p1 = UInt8((offset >> 8) & 0xFF)
    let p2 = UInt8(offset & 0xFF)
    let le = length == 256 ? 256 : length

    let command = CommandAPDU(cla: 0x00, ins: 0xB0, p1: p1, p2: p2, data: Data(), le: le)
    let response = try send(command, to: tag, sm: &sm)
    return response.data
  }

  private func send(_ command: CommandAPDU, to tag: NFCISO7816Tag, sm: inout SecureMessaging) throws -> ISOResponse {
    let protected = try sm.wrap(command)
    let response = try send(protected, to: tag)
    return try sm.unwrap(response)
  }

  private func send(_ command: CommandAPDU, to tag: NFCISO7816Tag) throws -> ISOResponse {
    let apdu = NFCISO7816APDU(
      instructionClass: command.cla,
      instructionCode: command.ins,
      p1Parameter: command.p1,
      p2Parameter: command.p2,
      data: command.data,
      expectedResponseLength: command.le ?? 0
    )

    let response = try send(apdu, to: tag)
    if response.sw1 == 0x6C {
      let retry = CommandAPDU(
        cla: command.cla,
        ins: command.ins,
        p1: command.p1,
        p2: command.p2,
        data: command.data,
        le: response.sw2 == 0 ? 256 : Int(response.sw2)
      )
      return try send(retry, to: tag)
    }

    guard response.status == 0x9000 else {
      throw PassportNFCError.statusWord(response.status)
    }

    return response
  }

  private func send(_ apdu: NFCISO7816APDU, to tag: NFCISO7816Tag) throws -> ISOResponse {
    let semaphore = DispatchSemaphore(value: 0)
    var responseData = Data()
    var sw1: UInt8 = 0x00
    var sw2: UInt8 = 0x00
    var responseError: Error?

    tag.sendCommand(apdu: apdu) { data, responseSW1, responseSW2, error in
      responseData = data
      sw1 = responseSW1
      sw2 = responseSW2
      responseError = error
      semaphore.signal()
    }

    semaphore.wait()

    if let responseError {
      throw responseError
    }

    return ISOResponse(data: responseData, sw1: sw1, sw2: sw2)
  }

  // MARK: - Helpers

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

  private func setError(_ message: String) {
    DispatchQueue.main.async {
      self.errorMessage = message
    }
  }
}

// MARK: - Models + parsing

private struct CommandAPDU {
  let cla: UInt8
  let ins: UInt8
  let p1: UInt8
  let p2: UInt8
  let data: Data
  let le: Int?
}

private struct ISOResponse {
  let data: Data
  let sw1: UInt8
  let sw2: UInt8

  var status: UInt16 {
    (UInt16(sw1) << 8) | UInt16(sw2)
  }
}

private enum PassportNFCError: LocalizedError {
  case invalidChallenge
  case invalidMutualAuth
  case invalidTLV
  case statusWord(UInt16)
  case invalidMRZ

  var errorDescription: String? {
    switch self {
    case .invalidChallenge:
      return "Invalid challenge from passport."
    case .invalidMutualAuth:
      return "BAC mutual authentication failed."
    case .invalidTLV:
      return "Invalid TLV encoding in passport data."
    case .statusWord(let sw):
      return String(format: "Passport returned status 0x%04X", sw)
    case .invalidMRZ:
      return "MRZ is not valid for BAC."
    }
  }
}

private struct BACKeys {
  let kEnc: Data
  let kMac: Data

  init(mrz: String) throws {
    let info = try BACKeys.mrzInfo(from: mrz)
    let seed = sha1(Data(info.utf8)).prefix(16)
    kEnc = try BACKeys.deriveKey(seed: seed, counter: 0x00000001)
    kMac = try BACKeys.deriveKey(seed: seed, counter: 0x00000002)
  }

  static func mrzInfo(from mrz: String) throws -> String {
    let lines = mrz.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
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

  static func deriveKey(seed: Data, counter: UInt32) throws -> Data {
    var counterBE = counter.bigEndian
    var data = Data(seed)
    data.append(Data(bytes: &counterBE, count: 4))
    let hash = sha1(data)
    let key = hash.prefix(16)
    return adjustParity(key)
  }
}

private struct SecureMessaging {
  var ksEnc: Data
  var ksMac: Data
  var ssc: Data

  mutating func wrap(_ command: CommandAPDU) throws -> CommandAPDU {
    ssc = incrementSSC(ssc)

    var dataObjects = Data()
    if !command.data.isEmpty {
      let padded = padISO7816(command.data, blockSize: 8)
      let encrypted = try tripleDESEncrypt(padded, key: ksEnc)
      dataObjects.append(encodeTLV(tag: [0x87], value: Data([0x01]) + encrypted))
    }

    if let le = command.le {
      let leByte: UInt8 = le == 256 ? 0x00 : UInt8(le & 0xFF)
      dataObjects.append(encodeTLV(tag: [0x97], value: Data([leByte])))
    }

    let cla: UInt8 = 0x0C
    let header = Data([cla, command.ins, command.p1, command.p2])
    let mac = try retailMac(message: ssc + header + dataObjects, key: ksMac)
    dataObjects.append(encodeTLV(tag: [0x8E], value: mac))

    return CommandAPDU(cla: cla, ins: command.ins, p1: command.p1, p2: command.p2, data: dataObjects, le: 256)
  }

  mutating func unwrap(_ response: ISOResponse) throws -> ISOResponse {
    ssc = incrementSSC(ssc)

    let tlvs = try parseTLVs(response.data)
    let do99 = tlvs.first { $0.tag == [0x99] }
    guard let do99 else { throw PassportNFCError.invalidTLV }

    let statusData = [UInt8](do99.value)
    guard statusData.count == 2 else { throw PassportNFCError.invalidTLV }

    let sw1 = statusData[0]
    let sw2 = statusData[1]

    let do87 = tlvs.first { $0.tag == [0x87] }
    let do8e = tlvs.first { $0.tag == [0x8E] }

    var macData = Data()
    if let do87 { macData.append(encodeTLV(tag: [0x87], value: do87.value)) }
    macData.append(encodeTLV(tag: [0x99], value: do99.value))

    let expectedMac = try retailMac(message: ssc + macData, key: ksMac)

    if let do8e, do8e.value != expectedMac {
      throw PassportNFCError.invalidMutualAuth
    }

    var data = Data()
    if let do87 {
      guard do87.value.first == 0x01 else { throw PassportNFCError.invalidTLV }
      let encrypted = do87.value.dropFirst()
      let decrypted = try tripleDESDecrypt(Data(encrypted), key: ksEnc)
      data = unpadISO7816(decrypted)
    }

    return ISOResponse(data: data, sw1: sw1, sw2: sw2)
  }
}

private struct TLV {
  let tag: [UInt8]
  let value: Data
}

private struct TLVHeader {
  let tag: [UInt8]
  let length: Int
  let valueOffset: Int

  static func parse(from data: Data) throws -> TLVHeader {
    let (tag, length, valueOffset) = try parseTLVHeader(data)
    return TLVHeader(tag: tag, length: length, valueOffset: valueOffset)
  }
}

private func parseTLVHeader(_ data: Data) throws -> ([UInt8], Int, Int) {
  guard data.count >= 2 else { throw PassportNFCError.invalidTLV }
  var index = 0
  var tag: [UInt8] = [data[index]]
  index += 1

  if tag[0] & 0x1F == 0x1F {
    while index < data.count {
      let next = data[index]
      tag.append(next)
      index += 1
      if next & 0x80 == 0 { break }
    }
  }

  guard index < data.count else { throw PassportNFCError.invalidTLV }
  let lenByte = data[index]
  index += 1

  let length: Int
  if lenByte < 0x80 {
    length = Int(lenByte)
  } else {
    let count = Int(lenByte & 0x7F)
    guard index + count <= data.count else { throw PassportNFCError.invalidTLV }
    var value: Int = 0
    for _ in 0..<count {
      value = (value << 8) + Int(data[index])
      index += 1
    }
    length = value
  }

  return (tag, length, index)
}

private func parseTLVs(_ data: Data) throws -> [TLV] {
  var tlvs: [TLV] = []
  var index = 0
  while index < data.count {
    let slice = data.suffix(from: index)
    let (tag, length, valueOffset) = try parseTLVHeader(Data(slice))
    let valueStart = index + valueOffset
    let valueEnd = valueStart + length
    guard valueEnd <= data.count else { throw PassportNFCError.invalidTLV }
    tlvs.append(TLV(tag: tag, value: data.subdata(in: valueStart..<valueEnd)))
    index = valueEnd
  }
  return tlvs
}

private func encodeTLV(tag: [UInt8], value: Data) -> Data {
  var data = Data(tag)
  data.append(encodeLength(value.count))
  data.append(value)
  return data
}

private func encodeLength(_ length: Int) -> Data {
  if length < 0x80 { return Data([UInt8(length)]) }
  if length <= 0xFF { return Data([0x81, UInt8(length)]) }
  return Data([0x82, UInt8((length >> 8) & 0xFF), UInt8(length & 0xFF)])
}

private func parseDataGroupTags(from efCom: Data) -> [UInt8] {
  guard let outer = try? parseTLVs(efCom).first else { return [] }
  guard let tag5C = try? parseTLVs(outer.value).first(where: { $0.tag == [0x5C] }) else {
    return []
  }
  return [UInt8](tag5C.value)
}

private func dataGroupName(_ tag: UInt8) -> String {
  switch tag {
  case 0x61: return "DG1"
  case 0x75: return "DG2"
  case 0x63: return "DG3"
  case 0x76: return "DG4"
  case 0x65: return "DG5"
  case 0x66: return "DG6"
  case 0x67: return "DG7"
  case 0x68: return "DG8"
  case 0x69: return "DG9"
  case 0x6A: return "DG10"
  case 0x6B: return "DG11"
  case 0x6C: return "DG12"
  case 0x6D: return "DG13"
  case 0x6E: return "DG14"
  case 0x6F: return "DG15"
  case 0x70: return "DG16"
  default: return String(format: "DG(0x%02X)", tag)
  }
}

private func fileIdForDataGroupTag(_ tag: UInt8) -> Data? {
  guard let number = dataGroupNumber(tag) else { return nil }
  let fileId = 0x0100 + number
  return Data([UInt8((fileId >> 8) & 0xFF), UInt8(fileId & 0xFF)])
}

private func dataGroupNumber(_ tag: UInt8) -> Int? {
  switch tag {
  case 0x61: return 1
  case 0x75: return 2
  case 0x63: return 3
  case 0x76: return 4
  case 0x65: return 5
  case 0x66: return 6
  case 0x67: return 7
  case 0x68: return 8
  case 0x69: return 9
  case 0x6A: return 10
  case 0x6B: return 11
  case 0x6C: return 12
  case 0x6D: return 13
  case 0x6E: return 14
  case 0x6F: return 15
  case 0x70: return 16
  default: return nil
  }
}

private func extractMRZFromDG1(_ data: Data) -> String? {
  guard let tlv = try? parseTLVs(data).first(where: { $0.tag == [0x5F, 0x1F] }) else { return nil }
  return String(data: tlv.value, encoding: .utf8)
}

// MARK: - Crypto helpers

private func sha1(_ data: Data) -> Data {
  var hash = [UInt8](repeating: 0, count: Int(CC_SHA1_DIGEST_LENGTH))
  data.withUnsafeBytes { buffer in
    _ = CC_SHA1(buffer.baseAddress, CC_LONG(data.count), &hash)
  }
  return Data(hash)
}

private func adjustParity(_ key: Data) -> Data {
  var bytes = [UInt8](key)
  for i in bytes.indices {
    var b = bytes[i]
    var parity = 0
    for _ in 0..<7 {
      parity ^= Int(b & 0x01)
      b >>= 1
    }
    if parity == 0 {
      bytes[i] ^= 0x01
    }
  }
  return Data(bytes)
}

private func tripleDESEncrypt(_ data: Data, key: Data) throws -> Data {
  return try crypt(data: data, key: key, operation: CCOperation(kCCEncrypt))
}

private func tripleDESDecrypt(_ data: Data, key: Data) throws -> Data {
  return try crypt(data: data, key: key, operation: CCOperation(kCCDecrypt))
}

private func crypt(data: Data, key: Data, operation: CCOperation) throws -> Data {
  let key24 = key + key.prefix(8)
  let iv = Data(repeating: 0x00, count: 8)
  var outLength = 0
  var outData = Data(repeating: 0, count: data.count + kCCBlockSize3DES)
  let outDataCount = outData.count

  let status = outData.withUnsafeMutableBytes { outBytes in
    data.withUnsafeBytes { dataBytes in
      key24.withUnsafeBytes { keyBytes in
        iv.withUnsafeBytes { ivBytes in
          CCCrypt(
            operation,
            CCAlgorithm(kCCAlgorithm3DES),
            CCOptions(0),
            keyBytes.baseAddress, key24.count,
            ivBytes.baseAddress,
            dataBytes.baseAddress, data.count,
            outBytes.baseAddress, outDataCount,
            &outLength
          )
        }
      }
    }
  }

  guard status == kCCSuccess else {
    throw PassportNFCError.invalidMutualAuth
  }

  return outData.prefix(outLength)
}

private func desCBCEncrypt(_ data: Data, key: Data) throws -> Data {
  let iv = Data(repeating: 0x00, count: 8)
  var outLength = 0
  var outData = Data(repeating: 0, count: data.count + kCCBlockSizeDES)
  let outDataCount = outData.count

  let status = outData.withUnsafeMutableBytes { outBytes in
    data.withUnsafeBytes { dataBytes in
      key.withUnsafeBytes { keyBytes in
        iv.withUnsafeBytes { ivBytes in
          CCCrypt(
            CCOperation(kCCEncrypt),
            CCAlgorithm(kCCAlgorithmDES),
            CCOptions(0),
            keyBytes.baseAddress, key.count,
            ivBytes.baseAddress,
            dataBytes.baseAddress, data.count,
            outBytes.baseAddress, outDataCount,
            &outLength
          )
        }
      }
    }
  }

  guard status == kCCSuccess else {
    throw PassportNFCError.invalidMutualAuth
  }

  return outData.prefix(outLength)
}

private func retailMac(message: Data, key: Data) throws -> Data {
  let k1 = key.prefix(8)
  let k2 = key.suffix(8)

  let padded = padISO7816(message, blockSize: 8)
  let cbc = try desCBCEncrypt(padded, key: k1)
  let last = cbc.suffix(8).data

  let k1k2k1 = k1 + k2 + k1
  let encrypted = try tripleDESEncrypt(last, key: k1k2k1)
  return encrypted.prefix(8)
}

private func padISO7816(_ data: Data, blockSize: Int) -> Data {
  var padded = Data(data)
  padded.append(0x80)
  while padded.count % blockSize != 0 {
    padded.append(0x00)
  }
  return padded
}

private func unpadISO7816(_ data: Data) -> Data {
  var bytes = [UInt8](data)
  while let last = bytes.last, last == 0x00 { bytes.removeLast() }
  if bytes.last == 0x80 { bytes.removeLast() }
  return Data(bytes)
}

private func randomBytes(count: Int) throws -> Data {
  var data = Data(count: count)
  let status = data.withUnsafeMutableBytes { buffer in
    SecRandomCopyBytes(kSecRandomDefault, count, buffer.baseAddress!)
  }
  guard status == errSecSuccess else {
    throw PassportNFCError.invalidMutualAuth
  }
  return data
}

private func xorData(_ lhs: Data, _ rhs: Data) -> Data {
  let left = [UInt8](lhs)
  let right = [UInt8](rhs)
  var out = [UInt8]()
  out.reserveCapacity(min(left.count, right.count))
  for i in 0..<min(left.count, right.count) {
    out.append(left[i] ^ right[i])
  }
  return Data(out)
}

private func incrementSSC(_ ssc: Data) -> Data {
  var bytes = [UInt8](ssc)
  for i in stride(from: bytes.count - 1, through: 0, by: -1) {
    if bytes[i] == 0xFF {
      bytes[i] = 0x00
    } else {
      bytes[i] += 1
      break
    }
  }
  return Data(bytes)
}

// MARK: - Extensions

private extension Data.SubSequence {
  var data: Data { Data(self) }
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
}

extension Data {
  var base64Lines: String {
    let raw = base64EncodedString()
    return raw.chunked(into: 64).joined(separator: "\n")
  }
}

private extension String {
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
