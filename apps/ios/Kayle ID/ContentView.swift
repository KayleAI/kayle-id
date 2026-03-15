import SwiftUI

struct ContentView: View {
  @Binding var pendingQRCode: String?

  private enum NavigationDirection {
    case forward
    case backward
  }

  @StateObject private var session = VerificationSession()
  @StateObject private var nfcReader = PassportNFCReader()

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
                .offset(x: -directionSign * width * transitionProgress)
            }

            stepView(for: session.step)
              .offset(x: directionSign * width * (1 - transitionProgress))
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
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
        uploadStatus: session.nfcUploadStatusMessage,
        uploadProgress: session.nfcUploadProgress,
        isUploading: session.isUploadingNFC,
        onComplete: { result in
          session.nfcResult = result
          // Upload NFC data immediately
          Task {
            do {
              let shouldContinue = try await session.uploadNFCData()
              if shouldContinue {
                session.moveToStep(.selfie)
                await session.updatePhase(.selfieCapturing)
              }
            } catch {
              session.handleError(error)
            }
          }
        }
      )
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
            Task {
              do {
                _ = try await session.sendSelfieImage(image, index: index, total: total)
              } catch {
                session.handleError(error)
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

      PrimaryActionButton(title: "Get Started") {
        session.moveToStep(.scanning)
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
      Text("Review requested details")
        .font(.title3).bold()
        .foregroundStyle(.black)

      Text("Review what will be shared before you continue. Required items stay enabled. Optional items stay on this device unless you choose to include them.")
        .font(.subheadline)
        .foregroundStyle(.black.opacity(0.65))

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 20) {
          shareFieldSection(
            title: "Security Details",
            description: "These identifiers help protect your verification from misuse and duplicate claims.",
            fields: kayleFields
          )

          shareFieldSection(
            title: "Required Details",
            description: "These details are required by the relying service to complete verification.",
            fields: requiredFields
          )

          shareFieldSection(
            title: "Optional Details",
            description: "You can choose whether to include these extra details in the shared result.",
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
    .alert("Cancel verification?", isPresented: $isShareCancelConfirmationPresented) {
      Button("Keep reviewing", role: .cancel) {}
      Button("Cancel verification", role: .destructive) {
        session.reset()
      }
    } message: {
      Text("This will end the current verification flow on this device.")
    }
  }

  private func shareFieldRow(_ field: VerifyShareRequestField) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(displayNameForShareField(field.key))
            .font(.headline)
            .foregroundStyle(.black)

          Text(field.reason)
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
        .disabled(field.required)
      }
    }
    .padding(16)
    .background(Color.black.opacity(0.03))
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
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
      Task {
        do {
          try await session.retryVerification()
        } catch {
          session.handleError(error)
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

}
