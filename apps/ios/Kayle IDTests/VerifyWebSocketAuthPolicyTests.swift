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

  func testMatchesExpectedPhaseAck() {
    XCTAssertTrue(isExpectedPhaseAck("phase_ok"))
    XCTAssertFalse(isExpectedPhaseAck("data_ok_1_0"))
    XCTAssertFalse(isExpectedPhaseAck(nil))
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

  func testDefaultSelectedShareFieldKeysAlwaysIncludeKayleHumanId() {
    let shareRequest = VerifyShareRequest(
      contractVersion: 1,
      sessionId: "vs_test_123",
      fields: [
        VerifyShareRequestField(
          key: "kayle_human_id",
          reason: "Human ID supports anti-fraud checks.",
          required: false
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
      Set(["kayle_human_id"])
    )
  }

  func testDisplayNameForShareFieldHumanizesClaimKeys() {
    XCTAssertEqual(
      displayNameForShareField("kayle_document_id"),
      "Kayle Document ID"
    )
    XCTAssertEqual(
      displayNameForShareField("dg1_date_of_birth"),
      "Date of Birth"
    )
    XCTAssertEqual(
      displayNameForShareField("dg2_face_image"),
      "Document Photo"
    )
    XCTAssertEqual(
      displayNameForShareField("age_over_18"),
      "Over 18"
    )
  }

  func testShareRequestFieldsAreGroupedIntoKayleRequiredAndOptionalSections() {
    let shareRequest = VerifyShareRequest(
      contractVersion: 1,
      sessionId: "vs_test_123",
      fields: [
        VerifyShareRequestField(
          key: "kayle_document_id",
          reason: "Kayle document identifier.",
          required: true
        ),
        VerifyShareRequestField(
          key: "kayle_human_id",
          reason: "Kayle human identifier.",
          required: true
        ),
        VerifyShareRequestField(
          key: "dg1_nationality",
          reason: "Nationality is required.",
          required: true
        ),
        VerifyShareRequestField(
          key: "dg2_face_image",
          reason: "Photo is optional.",
          required: false
        ),
      ]
    )

    XCTAssertEqual(
      kayleShareRequestFields(shareRequest).map(\.key),
      ["kayle_document_id", "kayle_human_id"]
    )
    XCTAssertEqual(
      requiredShareRequestFields(shareRequest).map(\.key),
      ["dg1_nationality"]
    )
    XCTAssertEqual(
      optionalShareRequestFields(shareRequest).map(\.key),
      ["dg2_face_image"]
    )
  }

  func testShareFieldDetailTextUsesVerifiedDatePreviewWhenAvailable() {
    let field = VerifyShareRequestField(
      key: "dg1_date_of_birth",
      reason: "Sharing Date of Birth",
      required: true
    )
    let previewContext = VerifySharePreviewContext(
      birthDate: "2005-04-29",
      documentNumber: nil,
      documentType: nil,
      expiryDate: nil,
      givenNames: nil,
      issuingCountry: nil,
      nationality: nil,
      optionalData: nil,
      sex: nil,
      surname: nil
    )

    XCTAssertEqual(
      shareFieldDetailText(field, previewContext: previewContext),
      "29/04/2005"
    )
  }

  func testShareFieldDetailTextExplainsRequiredSecurityFields() {
    let field = VerifyShareRequestField(
      key: "kayle_human_id",
      reason: "Sharing Kayle Human ID",
      required: true
    )

    XCTAssertEqual(
      shareFieldDetailText(field, previewContext: nil),
      "Required security identifier to help prevent duplicate claims."
    )
  }

  func testOrderedSelectedShareFieldKeysFollowShareRequestOrder() {
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
        VerifyShareRequestField(
          key: "kayle_human_id",
          reason: "Human ID is optional.",
          required: false
        ),
      ]
    )

    XCTAssertEqual(
      orderedSelectedShareFieldKeys(
        shareRequest: shareRequest,
        selectedShareFieldKeys: Set([
          "kayle_human_id",
          "kayle_document_id",
        ])
      ),
      ["kayle_document_id", "kayle_human_id"]
    )
  }

  func testShareSelectionIsOnlySubmittableWhenRequiredFieldsRemainSelected() {
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

    XCTAssertTrue(
      isShareSelectionSubmittable(
        shareRequest: shareRequest,
        selectedShareFieldKeys: Set(["kayle_document_id"])
      )
    )

    XCTAssertFalse(
      isShareSelectionSubmittable(
        shareRequest: shareRequest,
        selectedShareFieldKeys: []
      )
    )
  }

  func testKayleHumanIdSelectionIsLockedEvenWhenNotMarkedRequired() {
    let field = VerifyShareRequestField(
      key: "kayle_human_id",
      reason: "Human ID supports anti-fraud checks.",
      required: false
    )

    XCTAssertTrue(isShareFieldSelectionLocked(field))
  }
}
