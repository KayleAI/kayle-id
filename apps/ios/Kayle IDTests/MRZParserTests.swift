import XCTest
@testable import KayleIDModels

final class MRZParserTests: XCTestCase {
  func testTD3PassportParsesSuccessfully() throws {
    let td3 =
      """
      P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
      L898902C36UTO7408122F1204159ZE184226B<<<<<10
      """

    let parsed = try MRZParser.parseAndValidate(td3)

    XCTAssertEqual(parsed.format, .td3)
    XCTAssertEqual(parsed.documentType, "P<")
    XCTAssertTrue(parsed.checks.isValid)
  }

  func testTD1DocumentRejectedForPhase4() {
    let td1 =
      """
      I<UTOD231458907<<<<<<<<<<<<<<<
      7408122F1204159UTO<<<<<<<<<<<6
      ERIKSSON<<ANNA<MARIA<<<<<<<<<<
      """

    XCTAssertThrowsError(try MRZParser.parseAndValidate(td1))
  }

  func testTD2DocumentRejectedForPhase4() {
    let td2 =
      """
      I<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<
      D231458907UTO7408122F1204159<<<<<<<
      """

    XCTAssertThrowsError(try MRZParser.parseAndValidate(td2))
  }
}
