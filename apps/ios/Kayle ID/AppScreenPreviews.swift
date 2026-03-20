import SwiftUI

#if DEBUG
@MainActor
private struct ContentViewPreviewScreen: View {
  @State private var pendingQRCode: String?

  private let session: VerificationSession
  private let nfcReader: PassportNFCReader
  private let initialMRZSheetPresented: Bool
  private let initialAboutSheetPresented: Bool

  init(
    step: VerificationStep,
    initialMRZSheetPresented: Bool = false,
    initialAboutSheetPresented: Bool = false,
    configure: (VerificationSession, PassportNFCReader) -> Void = { _, _ in }
  ) {
    let session = VerificationSession()
    let nfcReader = PassportNFCReader()

    session.step = step
    session.payload = PreviewFixtures.payload
    configure(session, nfcReader)

    self.session = session
    self.nfcReader = nfcReader
    self.initialMRZSheetPresented = initialMRZSheetPresented
    self.initialAboutSheetPresented = initialAboutSheetPresented
  }

  var body: some View {
    ContentView(
      pendingQRCode: $pendingQRCode,
      session: session,
      nfcReader: nfcReader,
      initialMRZSheetPresented: initialMRZSheetPresented,
      initialAboutSheetPresented: initialAboutSheetPresented
    )
  }
}

@MainActor
private enum PreviewFixtures {
  static let payload = QRCodePayload(
    v: 1,
    sessionId: "vs_preview_session",
    attemptId: "va_preview_attempt",
    mobileWriteToken: "preview_mobile_write_token",
    expiresAt: Date().addingTimeInterval(60 * 60)
  )

  static let mrzResult = MRZResult(
    format: .td3,
    documentType: "P",
    issuingCountry: "GBR",
    surnames: "DOE",
    givenNames: "JANE",
    documentNumber: "123456789",
    documentNumberRaw: "123456789",
    documentNumberCheckDigit: "7",
    nationality: "GBR",
    birthDateYYMMDD: "900101",
    birthDateCheckDigit: "2",
    sex: "F",
    expiryDateYYMMDD: "300101",
    expiryDateCheckDigit: "9",
    optionalData: "",
    checks: MRZResult.Checks(
      lineLengthsOK: true,
      charsetOK: true,
      documentNumberOK: true,
      birthDateOK: true,
      expiryDateOK: true,
      optionalDataOK: true,
      compositeOK: true
    )
  )

  static let nfcResult = PassportReadResult(
    mrz: mrzResult.mrzKey,
    dg1MRZ: nil,
    dataGroups: [
      PassportDataGroup(id: 0x61, name: "DG1", data: Data("DG1".utf8)),
      PassportDataGroup(id: 0x75, name: "DG2", data: Data("DG2".utf8)),
      PassportDataGroup(id: 0x77, name: "SOD", data: Data("SOD".utf8)),
    ],
    passportImage: nil,
    signatureImage: nil,
    firstName: "JANE",
    lastName: "DOE",
    documentNumber: "123456789",
    nationality: "GBR",
    dateOfBirth: "1990-01-01",
    gender: "F",
    expiryDate: "2030-01-01",
    issuingAuthority: "GBR",
    documentType: "Passport"
  )

  static let shareRequest = VerifyShareRequest(
    contractVersion: 1,
    sessionId: "vs_preview_session",
    fields: [
      VerifyShareRequestField(
        key: "kayle_document_id",
        reason: "Kayle needs a stable document identifier to secure the verification.",
        required: true
      ),
      VerifyShareRequestField(
        key: "kayle_human_id",
        reason: "Kayle needs a stable human identifier to secure the verification.",
        required: true
      ),
      VerifyShareRequestField(
        key: "family_name",
        reason: "The relying party needs your family name.",
        required: true
      ),
      VerifyShareRequestField(
        key: "date_of_birth",
        reason: "The relying party needs your date of birth.",
        required: true
      ),
      VerifyShareRequestField(
        key: "nationality_code",
        reason: "The relying party can optionally use your nationality.",
        required: false
      ),
      VerifyShareRequestField(
        key: "document_photo",
        reason: "The relying party can optionally use your document portrait.",
        required: false
      ),
    ]
  )

  static let acceptedVerdict = VerifyServerVerdict(
    outcome: .accepted,
    reasonCode: "",
    reasonMessage: "",
    retryAllowed: false,
    remainingAttempts: 0
  )

  static let rejectedVerdict = VerifyServerVerdict(
    outcome: .rejected,
    reasonCode: "selfie_face_mismatch",
    reasonMessage: "Selfie evidence did not match the passport photo.",
    retryAllowed: true,
    remainingAttempts: 2
  )
}

#Preview("Welcome") {
  ContentViewPreviewScreen(step: .welcome)
}

#Preview("About") {
  ContentViewPreviewScreen(step: .welcome, initialAboutSheetPresented: true)
}

#Preview("QR Scan") {
  ContentViewPreviewScreen(step: .scanning)
}

#Preview("Document Instructions") {
  ContentViewPreviewScreen(step: .mrz)
}

#Preview("Photo Page Scan Sheet") {
  ContentViewPreviewScreen(step: .mrz, initialMRZSheetPresented: true)
}

#Preview("RFID Check") {
  ContentViewPreviewScreen(step: .rfidCheck)
}

#Preview("NFC Read") {
  ContentViewPreviewScreen(step: .nfc) { session, nfcReader in
    session.mrzResult = PreviewFixtures.mrzResult
    nfcReader.progress = 2
    nfcReader.status = "Authenticating with document…"
  }
}

#Preview("NFC Upload") {
  ContentViewPreviewScreen(step: .nfc) { session, nfcReader in
    session.mrzResult = PreviewFixtures.mrzResult
    session.isUploadingNFC = true
    session.nfcUploadProgress = 0.58
    nfcReader.progress = 4
  }
}

#Preview("Selfie Intro") {
  ContentViewPreviewScreen(step: .selfieIntro)
}

#Preview("Selfie Capture") {
  ContentViewPreviewScreen(step: .selfie)
}

#Preview("Share Details") {
  ContentViewPreviewScreen(step: .shareDetails) { session, _ in
    session.mrzResult = PreviewFixtures.mrzResult
    session.nfcResult = PreviewFixtures.nfcResult
    session.shareRequest = PreviewFixtures.shareRequest
    session.selectedShareFieldKeys = Set([
      "kayle_document_id",
      "kayle_human_id",
      "family_name",
      "date_of_birth",
      "document_photo",
    ])
  }
}

#Preview("Verification Complete") {
  ContentViewPreviewScreen(step: .complete) { session, _ in
    session.verdict = PreviewFixtures.acceptedVerdict
  }
}

#Preview("Retryable Failure") {
  ContentViewPreviewScreen(step: .complete) { session, _ in
    session.verdict = PreviewFixtures.rejectedVerdict
  }
}

#Preview("Error") {
  ContentViewPreviewScreen(step: .error) { session, _ in
    session.errorMessage = "Missing DG2 from NFC read. Please scan your passport chip again."
  }
}
#endif
