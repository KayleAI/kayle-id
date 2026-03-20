import SwiftUI

private enum AppAbout {
  static let appName = "Kayle ID"
  static let privacyPolicyURL = URL(string: "https://kayle.id/privacy")
  static let termsOfServiceURL = URL(string: "https://kayle.id/terms")

  static func versionDescription(bundle: Bundle = .main) -> String {
    let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String

    switch (version?.trimmingCharacters(in: .whitespacesAndNewlines), build?.trimmingCharacters(in: .whitespacesAndNewlines)) {
    case let (version?, build?) where !version.isEmpty && !build.isEmpty && version != build:
      return "Version \(version) (\(build))"
    case let (version?, _) where !version.isEmpty:
      return "Version \(version)"
    case let (_, build?) where !build.isEmpty:
      return "Build \(build)"
    default:
      return "Version unavailable"
    }
  }
}

private struct AboutLinkRow: View {
  let title: String
  let subtitle: String
  let destination: URL?

  var body: some View {
    Group {
      if let destination {
        Link(destination: destination) {
          rowContent
        }
      } else {
        rowContent
      }
    }
    .buttonStyle(.plain)
  }

  private var rowContent: some View {
    HStack(alignment: .center, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.headline)
          .foregroundStyle(.black)

        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
      }

      Spacer(minLength: 12)

      Image(systemName: destination == nil ? "exclamationmark.circle" : "arrow.up.right")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(.black.opacity(0.5))
    }
    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
    .padding(16)
    .background(Color.black.opacity(0.03))
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .contentShape(Rectangle())
  }
}

private struct AboutSheetView: View {
  @Environment(\.dismiss) private var dismiss

  private let versionDescription = AppAbout.versionDescription()

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 24) {
          VStack(spacing: 12) {
            Image("Logo")
              .resizable()
              .scaledToFit()
              .frame(width: 96, height: 96)
              .clipShape(RoundedRectangle(cornerRadius: 20))
              .overlay(
                RoundedRectangle(cornerRadius: 20)
                  .stroke(Color.black.opacity(0.1), lineWidth: 1)
              )

            Text(AppAbout.appName)
              .font(.title2).bold()
              .foregroundStyle(.black)

            Text(versionDescription)
              .font(.subheadline)
              .foregroundStyle(.black.opacity(0.6))
          }
          .frame(maxWidth: .infinity)
          .padding(.top, 8)

          VStack(alignment: .leading, spacing: 12) {
            AboutLinkRow(
              title: "Terms of Service",
              subtitle: "Terms for using Kayle ID and its identity verification features.",
              destination: AppAbout.termsOfServiceURL
            )

            AboutLinkRow(
              title: "Privacy Policy",
              subtitle: "How Kayle ID collects, uses, and protects your information.",
              destination: AppAbout.privacyPolicyURL
            )
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(24)
      }
      .background(Color.white)
      .navigationTitle("About")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") {
            dismiss()
          }
          .foregroundStyle(.black)
        }
      }
    }
    .presentationDragIndicator(.visible)
  }
}

struct ContentView: View {
  @Binding var pendingQRCode: String?

  private enum NavigationDirection {
    case forward
    case backward
  }

  @StateObject private var session: VerificationSession
  @StateObject private var nfcReader: PassportNFCReader

  @State private var previousStep: VerificationStep?
  @State private var lastStep: VerificationStep = .welcome
  @State private var navDirection: NavigationDirection = .forward
  @State private var transitionProgress: CGFloat = 1

  // MRZ scanning state
  @State private var isMRZSheetPresented = false
  @State private var isMRZLocked = false
  @State private var cameraBlur: CGFloat = 0
  @State private var didTriggerMRZ = false
  @State private var cardAccessNumber: String?
  @State private var isShareCancelConfirmationPresented = false
  @State private var isAboutSheetPresented = false

  @MainActor
  init(
    pendingQRCode: Binding<String?>,
    session: VerificationSession? = nil,
    nfcReader: PassportNFCReader? = nil,
    initialMRZSheetPresented: Bool = false,
    initialAboutSheetPresented: Bool = false
  ) {
    let resolvedSession = session ?? VerificationSession()
    let resolvedNFCReader = nfcReader ?? PassportNFCReader()

    _pendingQRCode = pendingQRCode
    _session = StateObject(wrappedValue: resolvedSession)
    _nfcReader = StateObject(wrappedValue: resolvedNFCReader)
    _isMRZSheetPresented = State(initialValue: initialMRZSheetPresented)
    _isAboutSheetPresented = State(initialValue: initialAboutSheetPresented)
  }

  var body: some View {
    NavigationStack {
      ZStack {
        Color.white.ignoresSafeArea()

        GeometryReader { geo in
          let width = geo.size.width
          let directionSign: CGFloat = navDirection == .forward ? 1 : -1

          ZStack {
            if let previousStep {
              stepView(for: previousStep)
                .frame(width: width, height: geo.size.height)
                .offset(x: -directionSign * width * transitionProgress)
            }

            stepView(for: session.step)
              .frame(width: width, height: geo.size.height)
              .offset(x: directionSign * width * (1 - transitionProgress))
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .clipped()
        }
        .ignoresSafeArea(
          edges: usesFullScreenCameraBackground ? [.top, .bottom] : []
        )
      }
    }
    .tint(.black)
    .onAppear {
      lastStep = session.step
    }
    .onChange(of: session.step) { newStep in
      guard newStep != lastStep else { return }
      navDirection = newStep.rawValue >= lastStep.rawValue ? .forward : .backward
      previousStep = lastStep
      lastStep = newStep
      transitionProgress = 0

      withAnimation(.easeInOut(duration: 0.35)) {
        transitionProgress = 1
      }

      let outgoingStep = previousStep
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
        if previousStep == outgoingStep {
          previousStep = nil
        }
      }
    }
    .sheet(isPresented: $isMRZSheetPresented, onDismiss: handleMRZSheetDismiss) {
      CameraPermissionGate(onCancel: {
        isMRZSheetPresented = false
        session.moveToStep(.scanning)
      }) {
        mrzScannerSheet
      }
      .presentationDetents([.large])
      .presentationDragIndicator(.visible)
    }
    .sheet(isPresented: $isAboutSheetPresented) {
      AboutSheetView()
    }
    .onChange(of: pendingQRCode) { newCode in
      guard let code = newCode, !code.isEmpty else {
        return
      }

      handleQRCode(code)
      pendingQRCode = nil
    }
  }

  // MARK: - Scanning View

  private var scanningView: some View {
    CameraPermissionGate(onCancel: {
      // User cancelled - show error
      session.errorMessage = "Camera permission is required to scan QR codes."
      session.moveToStep(.error)
    }) {
      QRScannerView { code in
        handleQRCode(code)
      }
    }
  }

  @ViewBuilder
  private func stepView(for step: VerificationStep) -> some View {
    switch step {
    case .welcome:
      welcomeView
    case .scanning:
      scanningView
    case .mrz:
      mrzStepView
    case .rfidCheck:
      RFIDCheckView(
        onHasRFID: {
          session.hasRFIDSymbol = true
          session.moveToStep(.nfc)
          Task {
            await session.updatePhase(.nfcReading)
          }
        }
      )
    case .nfc:
      NFCReadingView(
        nfcReader: nfcReader,
        mrzKey: session.mrzResult?.mrzKey ?? "",
        cardAccessNumber: cardAccessNumber,
        uploadProgress: session.nfcUploadProgress,
        isUploading: session.isUploadingNFC,
        onComplete: { result in
          session.nfcResult = result
          let attemptId = session.payload?.attemptId
          // Upload NFC data immediately
          Task {
            do {
              let shouldContinue = try await session.uploadNFCData()
              if shouldContinue {
                session.moveToStep(.selfieIntro)
              }
            } catch {
              session.handleError(error, forAttemptId: attemptId)
            }
          }
        }
      )
    case .selfieIntro:
      selfieIntroductionView
    case .selfie:
      CameraPermissionGate(onCancel: {
        session.moveToStep(.error)
        session.errorMessage = "Camera permission is required for selfie capture."
      }) {
        SelfieCaptureView(
          onCapture: { images in
            session.selfieImages = images
          },
          onPhotoCaptured: { image, index, total in
            session.selfieImages.append(image)
            let attemptId = session.payload?.attemptId
            Task {
              do {
                _ = try await session.sendSelfieImage(image, index: index, total: total)
              } catch {
                session.handleError(error, forAttemptId: attemptId)
              }
            }
          }
        )
      }
    case .shareDetails:
      shareSelectionView
    case .complete:
      CompletionView(
        isSuccess: isAcceptedVerdict(session.verdict),
        message: completionMessage,
        primaryButtonTitle: completionPrimaryButtonTitle,
        onPrimaryAction: {
          handleCompletionPrimaryAction()
        },
        secondaryButtonTitle: completionSecondaryButtonTitle,
        onSecondaryAction: completionSecondaryButtonTitle == nil ? nil : {
          session.reset()
        }
      )
    case .error:
      CompletionView(
        isSuccess: false,
        message: session.errorMessage ?? "An unexpected error occurred.",
        primaryButtonTitle: "Done",
        onPrimaryAction: {
          session.reset()
        },
        secondaryButtonTitle: nil,
        onSecondaryAction: nil
      )
    }
  }

  // MARK: - Welcome View

  private var welcomeView: some View {
    VStack(alignment: .leading, spacing: 16) {
      Spacer()

      VStack(alignment: .center, spacing: 12) {
        Image("Logo")
          .resizable()
          .scaledToFit()
          .frame(width: 96, height: 96)
          .clipShape(RoundedRectangle(cornerRadius: 20))
          .overlay(
            RoundedRectangle(cornerRadius: 20)
              .stroke(Color.black.opacity(0.1), lineWidth: 1)
          )

        Text("Kayle ID")
          .font(.title2).bold()
          .foregroundStyle(.black)

        Text("Let’s verify your identity in a few quick steps.")
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)

      Spacer()

      VStack(spacing: 12) {
        PrimaryActionButton(title: "Get Started") {
          session.moveToStep(.scanning)
        }

        SecondaryActionButton(title: "About") {
          isAboutSheetPresented = true
        }
      }
    }
    .padding(16)
  }

  // MARK: - MRZ Step View

  private var mrzStepView: some View {
    VStack(alignment: .leading, spacing: 16) {
      Spacer()

      VStack(alignment: .center, spacing: 12) {
        Image("Logo")
          .resizable()
          .scaledToFit()
          .frame(width: 96, height: 96)
          .clipShape(RoundedRectangle(cornerRadius: 20))
          .overlay(
            RoundedRectangle(cornerRadius: 20)
              .stroke(Color.black.opacity(0.1), lineWidth: 1)
          )

        Text("Let's read your ID")
          .font(.title3).bold()
          .foregroundStyle(.black)

        Text("Use your camera to scan your photo page, then read the chip if it has one.")
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)

      Spacer()

      PrimaryActionButton(title: "Continue") {
        presentMRZSheet()
      }
    }
    .padding(16)
  }

  // MARK: - MRZ Scanner Sheet

  private var mrzScannerSheet: some View {
    ZStack {
      MRZScannerView(onValidMRZ: { validMRZ, result, can in
        guard !didTriggerMRZ else { return }
        didTriggerMRZ = true

        session.mrzResult = result
        cardAccessNumber = can

        withAnimation(.easeInOut(duration: 0.25)) {
          isMRZLocked = true
        }
        withAnimation(.easeInOut(duration: 1.0)) {
          cameraBlur = 8
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
          withAnimation(.easeInOut(duration: 0.25)) {
            isMRZSheetPresented = false
          }
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            session.moveToStep(.rfidCheck)
            session.syncCompletedMRZScan()
          }
        }
      })
      .ignoresSafeArea()
      .blur(radius: cameraBlur)

      MRZScanOverlayView(isLocked: isMRZLocked)
        .allowsHitTesting(false)

      VStack(spacing: 6) {
        Spacer()
        Text("Scan your photo page")
          .font(.headline)
          .foregroundStyle(.white)

        Text("Align the photo page within the box.")
          .font(.subheadline)
          .foregroundStyle(.white.opacity(0.85))
      }
      .frame(maxWidth: .infinity)
      .padding(.horizontal, 24)
      .padding(.bottom, 24)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var shareSelectionView: some View {
    let kayleFields = kayleShareRequestFields(session.shareRequest)
    let requiredFields = requiredShareRequestFields(session.shareRequest)
    let optionalFields = optionalShareRequestFields(session.shareRequest)

    return VStack(alignment: .leading, spacing: 20) {
      Text("Choose what to share")
        .font(.title3).bold()
        .foregroundStyle(.black)

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 20) {
          shareFieldSection(
            title: "Security Details",
            description: "These identifiers are always included to protect services from abuse.",
            fields: kayleFields
          )

          shareFieldSection(
            title: "Required Details",
            description: "Review the details requested for this verification.",
            fields: requiredFields
          )

          shareFieldSection(
            title: "Optional Details",
            description: "You can optionally choose to share these details.",
            fields: optionalFields
          )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
      }

      if session.isSubmittingShareSelection {
        HStack(spacing: 10) {
          ProgressView()
            .progressViewStyle(.circular)
            .tint(.black)

          Text("Submitting your selection…")
            .font(.subheadline)
            .foregroundStyle(.black.opacity(0.7))
        }
      }

      if let errorMessage = session.shareSelectionErrorMessage {
        Text(errorMessage)
          .font(.subheadline)
          .foregroundStyle(Color.red)
      }

      VStack(spacing: 12) {
        PrimaryActionButton(
          title: session.isSubmittingShareSelection ? "Submitting..." : "Continue",
          isDisabled: session.isSubmittingShareSelection || !session.canSubmitShareSelection()
        ) {
          Task {
            await session.submitShareSelection()
          }
        }

        SecondaryActionButton(title: "Cancel") {
          isShareCancelConfirmationPresented = true
        }
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color.white.ignoresSafeArea())
    .tint(Color(uiColor: .systemBlue))
    .confirmationDialog(
      "Cancel verification?",
      isPresented: $isShareCancelConfirmationPresented,
      titleVisibility: .visible
    ) {
      Button("Cancel verification", role: .destructive) {
        session.reset()
      }
      Button("Stay here", role: .cancel) {}
    } message: {
      Text("This will stop the current verification on this device.")
    }
  }

  private var selfieIntroductionView: some View {
    VStack(alignment: .leading, spacing: 16) {
      Spacer()

      VStack(alignment: .center, spacing: 12) {
        Image(systemName: "person.crop.circle")
          .font(.system(size: 72))
          .foregroundStyle(.black)

        Text("Next, take a quick selfie")
          .font(.title3).bold()
          .foregroundStyle(.black)

        Text("We’ll automatically capture three photos. Make sure your face is well lit and clearly visible.")
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)

      Spacer()

      PrimaryActionButton(title: "Continue") {
        startSelfieCapture()
      }
    }
    .padding(16)
    .background(Color.white.ignoresSafeArea())
  }

  private func shareFieldRow(_ field: VerifyShareRequestField) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(displayNameForShareField(field.key))
            .font(.headline)
            .foregroundStyle(.black)

          Text(shareFieldDetailText(field, previewContext: sharePreviewContext))
            .font(.subheadline)
            .foregroundStyle(.black.opacity(0.6))
        }

        Spacer(minLength: 12)

        Toggle(
          "",
          isOn: Binding(
            get: {
              session.isShareFieldSelected(field.key)
            },
            set: { isSelected in
              session.setShareFieldSelected(field.key, isSelected: isSelected)
            }
          )
        )
        .labelsHidden()
        .tint(.green)
        .disabled(isShareFieldSelectionLocked(field))
      }
    }
    .padding(16)
    .background(Color.black.opacity(0.03))
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  private var sharePreviewContext: VerifySharePreviewContext? {
    if session.nfcResult == nil && session.mrzResult == nil {
      return nil
    }

    return VerifySharePreviewContext(
      birthDate: nonEmptySharePreviewValue(
        session.nfcResult?.dateOfBirth ?? session.mrzResult?.birthDateYYMMDD
      ),
      documentNumber: nonEmptySharePreviewValue(
        session.nfcResult?.documentNumber ?? session.mrzResult?.documentNumber
      ),
      documentType: nonEmptySharePreviewValue(
        session.nfcResult?.documentType ?? session.mrzResult?.documentType
      ),
      expiryDate: nonEmptySharePreviewValue(
        session.nfcResult?.expiryDate ?? session.mrzResult?.expiryDateYYMMDD
      ),
      givenNames: nonEmptySharePreviewValue(
        session.nfcResult?.firstName ?? session.mrzResult?.givenNames
      ),
      issuingCountry: nonEmptySharePreviewValue(
        session.mrzResult?.issuingCountry ?? session.nfcResult?.issuingAuthority
      ),
      nationality: nonEmptySharePreviewValue(
        session.nfcResult?.nationality ?? session.mrzResult?.nationality
      ),
      optionalData: nonEmptySharePreviewValue(session.mrzResult?.optionalData),
      sex: nonEmptySharePreviewValue(
        session.nfcResult?.gender ?? session.mrzResult?.sex
      ),
      surname: nonEmptySharePreviewValue(
        session.nfcResult?.lastName ?? session.mrzResult?.surnames
      )
    )
  }

  private func nonEmptySharePreviewValue(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) else {
      return nil
    }

    return trimmed.isEmpty ? nil : trimmed
  }

  @ViewBuilder
  private func shareFieldSection(
    title: String,
    description: String,
    fields: [VerifyShareRequestField]
  ) -> some View {
    if !fields.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(title)
            .font(.headline)
            .foregroundStyle(.black)

          Text(description)
            .font(.subheadline)
            .foregroundStyle(.black.opacity(0.6))
        }

        LazyVStack(spacing: 12) {
          ForEach(fields) { field in
            shareFieldRow(field)
          }
        }
      }
    }
  }

  // MARK: - Helpers

  private var completionMessage: String {
    guard let verdict = session.verdict else {
      return "Your identity verification data has been securely transmitted. You can now close this app and return to your browser."
    }

    if isAcceptedVerdict(verdict) {
      return "Your identity verification data has been securely transmitted. You can now close this app and return to your browser."
    }

    return verdict.reasonMessage
  }

  private var completionPrimaryButtonTitle: String {
    guard let verdict = session.verdict else {
      return "Done"
    }

    if isRejectedVerdict(verdict), verdict.retryAllowed {
      return "Retry Verification"
    }

    return "Done"
  }

  private var completionSecondaryButtonTitle: String? {
    guard let verdict = session.verdict else {
      return nil
    }

    return isRejectedVerdict(verdict) && verdict.retryAllowed ? "Done" : nil
  }

  private func handleCompletionPrimaryAction() {
    if let verdict = session.verdict, isRejectedVerdict(verdict), verdict.retryAllowed {
      let attemptId = session.payload?.attemptId
      Task {
        do {
          try await session.retryVerification()
        } catch {
          session.handleError(error, forAttemptId: attemptId)
        }
      }
      return
    }

    session.reset()
  }

  private func handleQRCode(_ code: String) {
    do {
      let payload = try QRCodePayload.parse(from: code)
      try session.initialize(with: payload)
      // Show ID scan instructions before RFID check.
      session.moveToStep(.mrz)
    } catch {
      session.handleError(error)
    }
  }

  private func presentMRZSheet() {
    isMRZLocked = false
    cameraBlur = 0
    didTriggerMRZ = false
    isMRZSheetPresented = true
    Task {
      await session.updatePhase(.mrzScanning)
    }
  }

  private func handleMRZSheetDismiss() {
    isMRZLocked = false
    cameraBlur = 0
    didTriggerMRZ = false
  }

  private var usesFullScreenCameraBackground: Bool {
    requiresFullScreenCameraBackground(session.step) ||
      previousStep.map(requiresFullScreenCameraBackground) == true
  }

  private func requiresFullScreenCameraBackground(_ step: VerificationStep) -> Bool {
    switch step {
    case .scanning, .selfie:
      return true
    default:
      return false
    }
  }

  private func startSelfieCapture() {
    session.moveToStep(.selfie)
    Task {
      await session.updatePhase(.selfieCapturing)
    }
  }

}
