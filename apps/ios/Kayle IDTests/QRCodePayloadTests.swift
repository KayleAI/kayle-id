import XCTest
@testable import KayleIDModels

final class QRCodePayloadTests: XCTestCase {
  private func makeJSON(
    attemptId: String = "va_test_attempt123",
    mobileWriteToken: String = "token_123",
    expiresAt: String = "2099-01-01T00:00:00Z",
    extra: String = ""
  ) -> String {
    """
    {"v":1,"session_id":"vs_test_session123","attempt_id":"\(attemptId)","mobile_write_token":"\(mobileWriteToken)","expires_at":"\(expiresAt)"\(extra)}
    """
  }

  func testParseRawJSONStringPayload() throws {
    let qr = "kayle-id://\(makeJSON())"
    let parsed = try QRCodePayload.parse(from: qr)

    XCTAssertEqual(parsed.sessionId, "vs_test_session123")
    XCTAssertEqual(parsed.attemptId, "va_test_attempt123")
    XCTAssertEqual(parsed.mobileWriteToken, "token_123")
    XCTAssertTrue(parsed.isValid)
  }

  func testParsePercentEncodedPayload() throws {
    let encoded = makeJSON()
      .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
    XCTAssertNotNil(encoded)

    let qr = "kayle-id://\(encoded ?? "")"
    let parsed = try QRCodePayload.parse(from: qr)

    XCTAssertEqual(parsed.attemptId, "va_test_attempt123")
    XCTAssertTrue(parsed.isValid)
  }

  func testParseSingleColonSchemePayload() throws {
    let encoded = makeJSON(expiresAt: "2099-01-01T00:00:00.000Z")
      .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
    XCTAssertNotNil(encoded)

    let qr = "kayle-id:\(encoded ?? "")"
    let parsed = try QRCodePayload.parse(from: qr)

    XCTAssertEqual(parsed.sessionId, "vs_test_session123")
    XCTAssertTrue(parsed.isValid)
  }

  func testParseFractionalSecondExpiryPayload() throws {
    let qr = "kayle-id://\(makeJSON(expiresAt: "2099-01-01T00:00:00.000Z"))"
    let parsed = try QRCodePayload.parse(from: qr)

    XCTAssertEqual(parsed.attemptId, "va_test_attempt123")
    XCTAssertTrue(parsed.isValid)
  }

  func testMissingAttemptIdIsInvalid() {
    let missingAttemptJSON =
      """
      {"v":1,"session_id":"vs_test_session123","mobile_write_token":"token_123","expires_at":"2099-01-01T00:00:00Z"}
      """

    let qr = "kayle-id://\(missingAttemptJSON)"

    XCTAssertThrowsError(try QRCodePayload.parse(from: qr))
  }

  func testExpiredPayloadIsInvalid() throws {
    let expiredJSON = makeJSON(expiresAt: "2000-01-01T00:00:00Z")
    let qr = "kayle-id://\(expiredJSON)"

    let parsed = try QRCodePayload.parse(from: qr)

    XCTAssertFalse(parsed.isValid)
  }

  func testUnknownFieldsAreIgnored() throws {
    let qr = "kayle-id://\(makeJSON(extra: ",\"extra\":\"ignored\""))"
    let parsed = try QRCodePayload.parse(from: qr)

    XCTAssertEqual(parsed.sessionId, "vs_test_session123")
    XCTAssertTrue(parsed.isValid)
  }
}
