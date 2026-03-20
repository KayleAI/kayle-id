import Foundation

enum MRZFormat: String {
  case td1 = "TD1"
  case td2 = "TD2"
  case td3 = "TD3"
}

struct MRZResult: Equatable {
  let format: MRZFormat
  let documentType: String
  let issuingCountry: String
  let surnames: String
  let givenNames: String

  let documentNumber: String
  let documentNumberRaw: String
  let documentNumberCheckDigit: Character
  let nationality: String
  let birthDateYYMMDD: String
  let birthDateCheckDigit: Character
  let sex: String
  let expiryDateYYMMDD: String
  let expiryDateCheckDigit: Character
  let optionalData: String

  let checks: Checks

  struct Checks: Equatable {
    let lineLengthsOK: Bool
    let charsetOK: Bool
    let documentNumberOK: Bool
    let birthDateOK: Bool
    let expiryDateOK: Bool
    let optionalDataOK: Bool
    let compositeOK: Bool

    var isValid: Bool {
      lineLengthsOK && charsetOK &&
      documentNumberOK && birthDateOK && expiryDateOK
    }
  }

  /// MRZ key used for NFC BAC authentication.
  var mrzKey: String {
    documentNumberRaw + String(documentNumberCheckDigit) +
    birthDateYYMMDD + String(birthDateCheckDigit) +
    expiryDateYYMMDD + String(expiryDateCheckDigit)
  }

  /// Convert to JSON-encodable dictionary for E2EE upload.
  func toUploadData() throws -> Data {
    let dict: [String: Any] = [
      "raw": "\(documentType)\(issuingCountry)\(surnames)<<\(givenNames)",
      "parsed": [
        "documentType": documentType,
        "issuingCountry": issuingCountry,
        "surname": surnames,
        "givenNames": givenNames,
        "documentNumber": documentNumber,
        "nationality": nationality,
        "dateOfBirth": birthDateYYMMDD,
        "sex": sex,
        "expiryDate": expiryDateYYMMDD,
        "optionalData": optionalData
      ],
      "checks": [
        "documentNumber": checks.documentNumberOK,
        "dateOfBirth": checks.birthDateOK,
        "expiryDate": checks.expiryDateOK,
        "composite": checks.compositeOK
      ]
    ]
    return try JSONSerialization.data(withJSONObject: dict)
  }
}
