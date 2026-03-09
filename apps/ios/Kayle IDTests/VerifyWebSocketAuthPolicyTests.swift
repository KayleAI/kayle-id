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

  func testParsesDataChunkRetryInstruction() {
    let instruction = parseChunkRetryInstruction(
      errorCode: "DATA_CHUNK_RETRY",
      errorMessage: #"{"kind":1,"index":0,"chunkIndex":2,"reason":"invalid_chunk_range"}"#
    )

    XCTAssertEqual(
      instruction,
      VerifyChunkRetryInstruction(
        kind: 1,
        index: 0,
        chunkIndex: 2,
        reason: "invalid_chunk_range"
      )
    )
  }

  func testParsesMissingNFCDataInstruction() {
    let instruction = parseMissingNFCDataInstruction(
      errorCode: "NFC_REQUIRED_DATA_MISSING",
      errorMessage:
        #"{"missing_artifacts":["dg1","sod"],"missing_chunks":[{"kind":1,"index":0,"chunk_total":3,"missing_chunk_indices":[2]}]}"#
    )

    XCTAssertEqual(
      instruction,
      VerifyMissingNFCDataInstruction(
        missingArtifacts: ["dg1", "sod"],
        missingChunks: [
          VerifyMissingNFCChunk(
            kind: 1,
            index: 0,
            chunkTotal: 3,
            missingChunkIndices: [2]
          ),
        ]
      )
    )
  }

  func testParsesMissingSelfieDataInstruction() {
    let instruction = parseMissingSelfieDataInstruction(
      errorCode: "SELFIE_REQUIRED_DATA_MISSING",
      errorMessage:
        #"{"required_total":3,"missing_selfie_indexes":[1,2],"missing_chunks":[{"kind":3,"index":0,"chunk_total":2,"missing_chunk_indices":[1]}]}"#
    )

    XCTAssertEqual(
      instruction,
      VerifyMissingSelfieDataInstruction(
        requiredTotal: 3,
        missingSelfieIndexes: [1, 2],
        missingChunks: [
          VerifyMissingNFCChunk(
            kind: 3,
            index: 0,
            chunkTotal: 2,
            missingChunkIndices: [1]
          ),
        ]
      )
    )
  }

  func testMatchesExpectedDataChunkAcks() {
    XCTAssertTrue(
      isExpectedDataAck(
        ackMessage: "data_chunk_ok_1_0_2",
        kind: 1,
        index: 0,
        chunkIndex: 2,
        chunkTotal: 3
      )
    )

    XCTAssertTrue(
      isExpectedDataAck(
        ackMessage: "data_ok_1_0",
        kind: 1,
        index: 0,
        chunkIndex: 2,
        chunkTotal: 3
      )
    )

    XCTAssertTrue(
      isExpectedDataAck(
        ackMessage: "data_ok_3_2",
        kind: 3,
        index: 2,
        chunkIndex: 0,
        chunkTotal: 1
      )
    )

    XCTAssertFalse(
      isExpectedDataAck(
        ackMessage: "data_chunk_ok_1_0_1",
        kind: 1,
        index: 0,
        chunkIndex: 2,
        chunkTotal: 3
      )
    )
  }

  func testAcceptedVerdictHelpers() {
    let verdict = VerifyServerVerdict(
      outcome: .accepted,
      reasonCode: "",
      reasonMessage: "",
      retryAllowed: false,
      remainingAttempts: 0
    )

    XCTAssertTrue(isAcceptedVerdict(verdict))
    XCTAssertFalse(isRejectedVerdict(verdict))
    XCTAssertFalse(shouldSuppressReconnectAfterHandledVerdict(verdict))
  }

  func testRejectedVerdictHelpers() {
    let verdict = VerifyServerVerdict(
      outcome: .rejected,
      reasonCode: "selfie_face_mismatch",
      reasonMessage: "Selfie evidence did not match the passport photo.",
      retryAllowed: true,
      remainingAttempts: 2
    )

    XCTAssertFalse(isAcceptedVerdict(verdict))
    XCTAssertTrue(isRejectedVerdict(verdict))
    XCTAssertTrue(shouldSuppressReconnectAfterHandledVerdict(verdict))
  }

  func testDefaultSelectedShareFieldKeysOnlyIncludesRequiredFields() {
    let shareRequest = VerifyShareRequest(
      contractVersion: 1,
      sessionId: "vs_test_123",
      fields: [
        VerifyShareRequestField(
          key: "kayle_document_id",
          reason: "Document ID is required.",
          required: true
        ),
        VerifyShareRequestField(
          key: "dg1_nationality",
          reason: "Nationality is optional.",
          required: false
        ),
      ]
    )

    XCTAssertEqual(
      defaultSelectedShareFieldKeys(shareRequest),
      Set(["kayle_document_id"])
    )
  }

  func testDisplayNameForShareFieldHumanizesClaimKeys() {
    XCTAssertEqual(
      displayNameForShareField("kayle_document_id"),
      "Kayle Document ID"
    )
    XCTAssertEqual(
      displayNameForShareField("age_over_18"),
      "Age Over 18"
    )
  }
}
