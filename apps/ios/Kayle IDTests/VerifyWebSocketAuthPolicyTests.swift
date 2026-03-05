import XCTest
@testable import KayleIDModels

final class VerifyWebSocketAuthPolicyTests: XCTestCase {
  func testHelloAckSuccess() {
    let result = parseHelloResponse(
      ackMessage: "hello_ok",
      errorCode: nil,
      errorMessage: nil
    )

    XCTAssertEqual(result, .success)
  }

  func testHelloAuthFailureMapping() {
    let result = parseHelloResponse(
      ackMessage: nil,
      errorCode: "HANDOFF_TOKEN_INVALID",
      errorMessage: "Invalid handoff token."
    )

    XCTAssertEqual(
      result,
      .failure(code: "HANDOFF_TOKEN_INVALID", message: "Invalid handoff token.")
    )
  }

  func testReconnectAllowedAfterTransientCloseForAuthenticatedSession() {
    let canRetry = shouldRetryReconnect(
      isAuthenticated: true,
      lastErrorCode: nil,
      attempt: 1,
      maxAttempts: 3
    )

    XCTAssertTrue(canRetry)
  }

  func testReconnectStopsOnNonRetryableAuthError() {
    let canRetry = shouldRetryReconnect(
      isAuthenticated: true,
      lastErrorCode: "HANDOFF_TOKEN_EXPIRED",
      attempt: 1,
      maxAttempts: 3
    )

    XCTAssertFalse(canRetry)
  }
}
