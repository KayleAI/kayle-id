//
//  MRZValidator.swift
//  Kayle ID
//
//  Created by Arsen on 03/01/2026.
//

import Foundation

struct MRZTD3Result: Equatable {
  let documentType: String
  let issuingCountry: String
  let surnames: String
  let givenNames: String

  let passportNumber: String
  let nationality: String
  let birthDateYYMMDD: String
  let sex: String
  let expiryDateYYMMDD: String

  let optionalData: String

  // Validations
  let checks: Checks

  struct Checks: Equatable {
    let lineLengthsOK: Bool
    let charsetOK: Bool
    let passportNumberOK: Bool
    let birthDateOK: Bool
    let expiryDateOK: Bool
    let optionalDataOK: Bool
    let compositeOK: Bool

    var isValid: Bool {
      lineLengthsOK && charsetOK &&
      passportNumberOK && birthDateOK && expiryDateOK &&
      optionalDataOK && compositeOK
    }
  }
}

enum MRZTD3Error: Error {
  case notTwoLines
  case wrongLength
  case invalidCharset
}

enum MRZTD3 {
  static func parseAndValidate(_ raw: String) throws -> MRZTD3Result {
    let lines = normalise(raw).split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
    guard lines.count == 2 else { throw MRZTD3Error.notTwoLines }
    let l1 = lines[0]
    let l2 = lines[1]

    guard l1.count == 44, l2.count == 44 else { throw MRZTD3Error.wrongLength }
    guard charsetOK(l1) && charsetOK(l2) else { throw MRZTD3Error.invalidCharset }

    // Line 1
    let documentType = String(l1.prefix(2))
    let issuingCountry = String(l1.slice(2, 5))
    let nameField = String(l1.suffix(39))
    let (surnames, givenNames) = parseNames(nameField)

    // Line 2 fixed positions (TD3)
    let passportNumberField = String(l2.slice(0, 9))
    let passportNumberCD = char(l2, 9)

    let nationality = String(l2.slice(10, 13))

    let birthDate = String(l2.slice(13, 19))
    let birthDateCD = char(l2, 19)

    let sex = String(char(l2, 20))

    let expiryDate = String(l2.slice(21, 27))
    let expiryDateCD = char(l2, 27)

    let personalNumber = String(l2.slice(28, 42))
    let personalNumberCD = char(l2, 42)

    let compositeCD = char(l2, 43)

    // Check digits
    let passportNumberOK = checkDigit(passportNumberField) == passportNumberCD
    let birthDateOK = checkDigit(birthDate) == birthDateCD
    let expiryDateOK = checkDigit(expiryDate) == expiryDateCD
    let optionalDataOK = checkDigit(personalNumber) == personalNumberCD

    // Composite: passportNo(0-9) + birth(13-19) + expiry(21-27) + personal(28-42)
    // Per spec: include check digits for those fields (i.e., use exact slices below)
    let compositeData =
      String(l2.slice(0, 10)) +     // passport number + cd
      String(l2.slice(13, 20)) +    // birth + cd
      String(l2.slice(21, 28)) +    // expiry + cd
      String(l2.slice(28, 43))      // personal number + cd

    let compositeOK = checkDigit(compositeData) == compositeCD

    return MRZTD3Result(
      documentType: documentType,
      issuingCountry: issuingCountry,
      surnames: surnames,
      givenNames: givenNames,
      passportNumber: unfill(passportNumberField),
      nationality: nationality,
      birthDateYYMMDD: birthDate,
      sex: sex,
      expiryDateYYMMDD: expiryDate,
      optionalData: unfill(personalNumber),
      checks: .init(
        lineLengthsOK: true,
        charsetOK: true,
        passportNumberOK: passportNumberOK,
        birthDateOK: birthDateOK,
        expiryDateOK: expiryDateOK,
        optionalDataOK: optionalDataOK,
        compositeOK: compositeOK
      )
    )
  }

  // MARK: - MRZ helpers

  static func normalise(_ s: String) -> String {
    // Uppercase, remove spaces, keep allowed + newlines
    let up = s.uppercased().replacingOccurrences(of: " ", with: "")
    let allowed = up.filter { ch in
      ch == "\n" || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch == "<"
    }
    return String(allowed)
  }

  static func charsetOK(_ s: String) -> Bool {
    s.allSatisfy { ch in
      (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch == "<"
    }
  }

  static func parseNames(_ field: String) -> (String, String) {
    // Surname<<Given<Names
    let parts = field.split(separator: "<", omittingEmptySubsequences: false)
    let raw = field.replacingOccurrences(of: "<<", with: "|")
    let pieces = raw.split(separator: "|", omittingEmptySubsequences: false)
    let surname = pieces.first.map(String.init) ?? ""
    let given = pieces.dropFirst().joined(separator: " ").replacingOccurrences(of: "<", with: " ")
    return (unfill(surname.replacingOccurrences(of: "<", with: " ")).trimmingCharacters(in: .whitespaces),
            unfill(given).trimmingCharacters(in: .whitespaces))
  }

  static func unfill(_ s: String) -> String {
    s.replacingOccurrences(of: "<", with: "").trimmingCharacters(in: .whitespaces)
  }

  static func char(_ s: String, _ idx: Int) -> Character {
    s[s.index(s.startIndex, offsetBy: idx)]
  }

  static func checkDigit(_ data: String) -> Character {
    // ICAO 9303 weights 7-3-1 repeating
    let weights = [7, 3, 1]
    var sum = 0
    for (i, ch) in data.enumerated() {
      let v = value(ch)
      sum += v * weights[i % 3]
    }
    let cd = sum % 10
    return Character(String(cd))
  }

  static func value(_ ch: Character) -> Int {
    if ch >= "0" && ch <= "9" {
      return Int(String(ch))!
    }
    if ch >= "A" && ch <= "Z" {
      let scalar = ch.unicodeScalars.first!.value
      return Int(scalar - Character("A").unicodeScalars.first!.value) + 10
    }
    if ch == "<" { return 0 }
    // Should never happen if normalised
    return 0
  }
}

private extension String {
  func slice(_ start: Int, _ end: Int) -> Substring {
    let s = index(self.startIndex, offsetBy: start)
    let e = index(self.startIndex, offsetBy: end)
    return self[s..<e]
  }
}
