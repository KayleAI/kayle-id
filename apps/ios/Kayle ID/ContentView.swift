import SwiftUI

struct ContentView: View {
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
        onComplete: { result in
          session.nfcResult = result
          // Upload NFC data immediately
          Task {
            do {
              await session.updatePhase(.nfcComplete)
              try await session.uploadNFCData()
              session.moveToStep(.selfie)
              await session.updatePhase(.selfieCapturing)
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
                let completed = try await session.sendSelfieImage(image, index: index, total: total)
                if completed {
                  await session.updatePhase(.selfieComplete)
                  await session.updatePhase(.complete)
                  session.moveToStep(.complete)
                }
              } catch {
                session.handleError(error)
              }
            }
          }
        )
      }
    case .complete:
      CompletionView(
        isSuccess: true,
        message: "Your identity verification data has been securely transmitted. You can now close this app and return to your browser.",
        onDone: {
          session.reset()
        }
      )
    case .error:
      CompletionView(
        isSuccess: false,
        message: session.errorMessage ?? "An unexpected error occurred.",
        onDone: {
          session.reset()
        }
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
            // Upload MRZ data immediately after scan
            Task {
              do {
                await session.updatePhase(.mrzComplete)
                try await session.uploadMRZData()
                session.moveToStep(.rfidCheck)
              } catch {
                session.handleError(error)
              }
            }
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

  // MARK: - Helpers

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
  }

  private func handleMRZSheetDismiss() {
    isMRZLocked = false
    cameraBlur = 0
    didTriggerMRZ = false
  }

}
