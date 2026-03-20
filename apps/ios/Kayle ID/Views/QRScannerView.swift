import AVFoundation
import SwiftUI

/// Standalone QR code scanner view - can be used in App Clips or main app.
/// Scans QR codes with the `kayle-id://` URL scheme.
struct QRScannerView: View {
  let onScan: (String) -> Void

  @State private var isScanning = true
  @State private var lastScannedCode: String?

  var body: some View {
    ZStack {
      if PreviewSupport.isRunningInXcodePreview {
        PreviewCameraSurfaceView(
          title: "QR camera preview",
          subtitle: "Camera input is not available in Xcode Canvas."
        )
      } else {
        QRScannerViewController(
          onScan: { code in
            guard isScanning, code != lastScannedCode else { return }
            lastScannedCode = code
            isScanning = false
            onScan(code)
          }
        )
        .ignoresSafeArea()
      }

      QRScannerOverlay()
    }
  }
}

// MARK: - Scanner Overlay

private struct QRScannerOverlay: View {
  private let cornerRadius: CGFloat = 24
  private let borderWidth: CGFloat = 4
  private let boxSize: CGFloat = 250

  var body: some View {
    GeometryReader { geo in
      let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)

      ZStack {
        // Dimmed background
        Color.black.opacity(0.6)

        // Cut out the scanner area
        RoundedRectangle(cornerRadius: cornerRadius)
          .frame(width: boxSize, height: boxSize)
          .position(center)
          .blendMode(.destinationOut)
      }
      .compositingGroup()

      // Border around scanner area
      RoundedRectangle(cornerRadius: cornerRadius)
        .stroke(Color.white, lineWidth: borderWidth)
        .frame(width: boxSize, height: boxSize)
        .position(center)

      // Instructions
      VStack {
        Spacer()

        VStack(spacing: 8) {
          Text("Scan QR Code")
            .font(.headline)
            .foregroundStyle(.white)

          Text("Point your camera at the QR code on the screen")
            .font(.subheadline)
            .foregroundStyle(.white.opacity(0.8))
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.bottom, 100)
      }
      .frame(maxWidth: .infinity)
    }
    .ignoresSafeArea()
  }
}

// MARK: - UIKit Camera Controller

struct QRScannerViewController: UIViewControllerRepresentable {
  let onScan: (String) -> Void

  func makeUIViewController(context: Context) -> QRCameraViewController {
    let controller = QRCameraViewController()
    controller.onScan = onScan
    return controller
  }

  func updateUIViewController(_ uiViewController: QRCameraViewController, context: Context) {}
}

final class QRCameraViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  var onScan: ((String) -> Void)?

  private let session = AVCaptureSession()
  private let metadataOutput = AVCaptureMetadataOutput()
  private let sessionQueue = DispatchQueue(label: "qr.capture.session")

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    setupCamera()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    sessionQueue.async { [session] in
      if !session.isRunning {
        session.startRunning()
      }
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sessionQueue.async { [session] in
      if session.isRunning {
        session.stopRunning()
      }
    }
  }

  private func setupCamera() {
    session.beginConfiguration()

    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input)
    else {
      session.commitConfiguration()
      return
    }

    session.addInput(input)

    // Preview layer
    let preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspectFill
    preview.frame = view.bounds
    view.layer.addSublayer(preview)

    // Metadata output for QR codes
    guard session.canAddOutput(metadataOutput) else {
      session.commitConfiguration()
      return
    }

    session.addOutput(metadataOutput)
    metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
    metadataOutput.metadataObjectTypes = [.qr]

    session.commitConfiguration()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if let preview = view.layer.sublayers?.first(where: { $0 is AVCaptureVideoPreviewLayer }) as? AVCaptureVideoPreviewLayer {
      preview.frame = view.bounds
    }
  }

  // MARK: - AVCaptureMetadataOutputObjectsDelegate

  nonisolated func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
          object.type == .qr,
          let stringValue = object.stringValue
    else { return }

    // Only process kayle-id:// (and legacy kayle://) URLs
    guard stringValue.hasPrefix("kayle-id://") || stringValue.hasPrefix("kayle://") else { return }

    Task { @MainActor in
      self.onScan?(stringValue)
    }
  }
}
