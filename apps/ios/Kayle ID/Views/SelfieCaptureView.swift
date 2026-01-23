import AVFoundation
import SwiftUI
import UIKit
import Vision

// MARK: - Constants for face capture area

/// The target rectangle dimensions for face positioning (vertical rectangle)
enum SelfieCaptureConstants {
  static let boxWidth: CGFloat = 250
  static let boxHeight: CGFloat = 350
  static let cornerRadius: CGFloat = 24
  static let borderWidth: CGFloat = 4
  /// Vertical offset from center (move box up to leave room for UI)
  static let verticalOffset: CGFloat = -60
  /// How long face must be in position before auto-capture starts (seconds)
  static let stabilityDuration: TimeInterval = 0.5
  /// Delay between consecutive photo captures (seconds)
  static let captureBurstDelay: TimeInterval = 0.3
  /// Number of selfies to auto-capture
  static let captureCount: Int = 3
}

/// Standalone selfie capture view - can be used in App Clips or main app.
/// Auto-captures three selfies when a face is detected and positioned in the target area.
struct SelfieCaptureView: View {
  let onCapture: ([UIImage]) -> Void
  let onCancel: () -> Void

  @State private var capturedImages: [UIImage] = []
  @State private var faceInBox = false
  @State private var captureProgress: Int = 0
  @State private var isCapturing = false
  @State private var statusMessage = "Position your face in the frame"

  var body: some View {
    ZStack {
      SelfieCameraView(
        faceInBox: $faceInBox,
        capturedImages: $capturedImages,
        isCapturing: $isCapturing,
        captureProgress: $captureProgress
      )
      .ignoresSafeArea()

      SelfieOverlayView(faceInBox: faceInBox, captureProgress: captureProgress)

      VStack {
        Spacer()

        VStack(spacing: 16) {
          Text(displayText)
            .font(.headline)
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)

          Text(subtitleText)
            .font(.subheadline)
            .foregroundStyle(.white.opacity(0.8))
            .multilineTextAlignment(.center)

          // Progress indicator during capture
          if isCapturing {
            HStack(spacing: 8) {
              ForEach(0..<SelfieCaptureConstants.captureCount, id: \.self) { index in
                Circle()
                  .fill(index < captureProgress ? Color.green : Color.white.opacity(0.3))
                  .frame(width: 12, height: 12)
              }
            }
            .padding(.top, 8)
          }

          // Cancel button (only shown when not capturing)
          if !isCapturing {
            SecondaryActionButton(title: "Cancel") {
              onCancel()
            }
            .frame(width: 120)
            .padding(.top, 16)
          }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 60)
      }
    }
    .onChange(of: capturedImages) { images in
      if images.count >= SelfieCaptureConstants.captureCount {
        onCapture(images)
      }
    }
  }

  private var displayText: String {
    if isCapturing {
      return "Hold still..."
    } else if faceInBox {
      return "Perfect! Stay still to capture"
    } else {
      return "Position your face in the frame"
    }
  }

  private var subtitleText: String {
    if isCapturing {
      return "Capturing \(captureProgress + 1) of \(SelfieCaptureConstants.captureCount)"
    } else {
      return "Make sure your face is well-lit and clearly visible"
    }
  }
}

// MARK: - Selfie Camera View

struct SelfieCameraView: UIViewControllerRepresentable {
  @Binding var faceInBox: Bool
  @Binding var capturedImages: [UIImage]
  @Binding var isCapturing: Bool
  @Binding var captureProgress: Int

  func makeUIViewController(context: Context) -> SelfieCameraViewController {
    let controller = SelfieCameraViewController()
    controller.delegate = context.coordinator
    return controller
  }

  func updateUIViewController(_ uiViewController: SelfieCameraViewController, context: Context) {
    // Pass screen dimensions for face-in-box calculations
    uiViewController.updateTargetRect(for: uiViewController.view.bounds.size)
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  class Coordinator: NSObject, SelfieCameraDelegate {
    var parent: SelfieCameraView

    init(_ parent: SelfieCameraView) {
      self.parent = parent
    }

    func didUpdateFaceInBox(_ inBox: Bool) {
      DispatchQueue.main.async {
        self.parent.faceInBox = inBox
      }
    }

    func didStartCapture() {
      DispatchQueue.main.async {
        self.parent.isCapturing = true
        self.parent.captureProgress = 0
      }
    }

    func didCapturePhoto(_ image: UIImage, index: Int) {
      DispatchQueue.main.async {
        self.parent.capturedImages.append(image)
        self.parent.captureProgress = index + 1
        
        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
      }
    }

    func didCompleteCapture() {
      DispatchQueue.main.async {
        self.parent.isCapturing = false
      }
    }
  }
}

// MARK: - Selfie Camera Controller

protocol SelfieCameraDelegate: AnyObject {
  func didUpdateFaceInBox(_ inBox: Bool)
  func didStartCapture()
  func didCapturePhoto(_ image: UIImage, index: Int)
  func didCompleteCapture()
}

private actor SelfieCaptureState {
  private var isAutoCapturing = false
  private var hasCompletedCapture = false
  private var faceInBoxStartTime: Date?
  private var viewSize: CGSize = .zero
  private var targetRect: CGRect = .zero
  private let stabilityDuration: TimeInterval

  init(stabilityDuration: TimeInterval) {
    self.stabilityDuration = stabilityDuration
  }

  func updateLayout(viewSize: CGSize, targetRect: CGRect) {
    self.viewSize = viewSize
    self.targetRect = targetRect
  }

  func beginCaptureIfPossible() -> Bool {
    guard !isAutoCapturing && !hasCompletedCapture else { return false }
    isAutoCapturing = true
    faceInBoxStartTime = nil
    return true
  }

  func finishCapture(markComplete: Bool) {
    isAutoCapturing = false
    if markComplete {
      hasCompletedCapture = true
    }
  }

  func evaluateFace(_ face: VNFaceObservation?) -> (faceInBox: Bool, shouldStartCapture: Bool) {
    guard !isAutoCapturing && !hasCompletedCapture else {
      faceInBoxStartTime = nil
      return (false, false)
    }

    guard viewSize.width > 0, viewSize.height > 0 else {
      faceInBoxStartTime = nil
      return (false, false)
    }

    guard let face else {
      faceInBoxStartTime = nil
      return (false, false)
    }

    let faceRect = CGRect(
      x: (1 - face.boundingBox.origin.x - face.boundingBox.width) * viewSize.width,
      y: (1 - face.boundingBox.origin.y - face.boundingBox.height) * viewSize.height,
      width: face.boundingBox.width * viewSize.width,
      height: face.boundingBox.height * viewSize.height
    )

    let faceCenterX = faceRect.midX
    let faceCenterY = faceRect.midY
    let tolerance: CGFloat = 40
    let expandedTargetRect = targetRect.insetBy(dx: -tolerance, dy: -tolerance)
    let faceInBox = expandedTargetRect.contains(CGPoint(x: faceCenterX, y: faceCenterY))

    var shouldStartCapture = false
    if faceInBox {
      if faceInBoxStartTime == nil {
        faceInBoxStartTime = Date()
      } else if let startTime = faceInBoxStartTime,
                Date().timeIntervalSince(startTime) >= stabilityDuration {
        shouldStartCapture = true
        faceInBoxStartTime = nil
      }
    } else {
      faceInBoxStartTime = nil
    }

    return (faceInBox, shouldStartCapture)
  }
}

final class SelfieCameraViewController: UIViewController {
  weak var delegate: SelfieCameraDelegate?

  private let session = AVCaptureSession()
  private let photoOutput = AVCapturePhotoOutput()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let sessionQueue = DispatchQueue(label: "selfie.capture.session")
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private nonisolated let captureState = SelfieCaptureState(
    stabilityDuration: SelfieCaptureConstants.stabilityDuration
  )
  
  // Face tracking state
  private var capturedPhotos: [UIImage] = []
  private var pendingCaptureCount = 0

  private nonisolated(unsafe) let faceRequest = VNDetectFaceRectanglesRequest()

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

  func updateTargetRect(for size: CGSize) {
    let centerX = size.width / 2
    let centerY = size.height / 2 + SelfieCaptureConstants.verticalOffset
    let targetRect = CGRect(
      x: centerX - SelfieCaptureConstants.boxWidth / 2,
      y: centerY - SelfieCaptureConstants.boxHeight / 2,
      width: SelfieCaptureConstants.boxWidth,
      height: SelfieCaptureConstants.boxHeight
    )
    Task {
      await captureState.updateLayout(viewSize: size, targetRect: targetRect)
    }
  }

  private func setupCamera() {
    session.beginConfiguration()
    session.sessionPreset = .photo

    // Use front camera
    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
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
    previewLayer = preview

    // Photo output for capture
    guard session.canAddOutput(photoOutput) else {
      session.commitConfiguration()
      return
    }
    session.addOutput(photoOutput)

    // Video output for face detection
    videoOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
    videoOutput.alwaysDiscardsLateVideoFrames = true
    videoOutput.setSampleBufferDelegate(self, queue: DispatchQueue(label: "selfie.face.detection"))

    guard session.canAddOutput(videoOutput) else {
      session.commitConfiguration()
      return
    }
    session.addOutput(videoOutput)

    session.commitConfiguration()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
    updateTargetRect(for: view.bounds.size)
  }

  private func startAutoCaptureSequence() async {
    guard await captureState.beginCaptureIfPossible() else { return }
    capturedPhotos = []
    pendingCaptureCount = 0

    delegate?.didStartCapture()
    captureNextPhoto()
  }

  private func captureNextPhoto() {
    guard pendingCaptureCount < SelfieCaptureConstants.captureCount else {
      // All photos captured
      Task {
        await captureState.finishCapture(markComplete: true)
      }
      delegate?.didCompleteCapture()
      return
    }

    let settings = AVCapturePhotoSettings()
    photoOutput.capturePhoto(with: settings, delegate: self)
  }
}

extension SelfieCameraViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
  nonisolated func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .leftMirrored, options: [:])
    try? handler.perform([faceRequest])

    let faces = faceRequest.results
    Task { [weak self] in
      guard let self else { return }
      let evaluation = await self.captureState.evaluateFace(faces?.first)
      await MainActor.run {
        self.delegate?.didUpdateFaceInBox(evaluation.faceInBox)
      }
      if evaluation.shouldStartCapture {
        await self.startAutoCaptureSequence()
      }
    }
  }
}

extension SelfieCameraViewController: AVCapturePhotoCaptureDelegate {
  nonisolated func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    guard error == nil,
          let data = photo.fileDataRepresentation(),
          let image = UIImage(data: data)
    else { return }

    // Mirror the image since we're using front camera
    let mirrored = UIImage(cgImage: image.cgImage!, scale: image.scale, orientation: .leftMirrored)
    
    Task { @MainActor [weak self] in
      guard let self else { return }
      
      let currentIndex = self.pendingCaptureCount
      self.capturedPhotos.append(mirrored)
      self.pendingCaptureCount += 1
      self.delegate?.didCapturePhoto(mirrored, index: currentIndex)

      // Schedule next capture after delay
      if self.pendingCaptureCount < SelfieCaptureConstants.captureCount {
        DispatchQueue.main.asyncAfter(deadline: .now() + SelfieCaptureConstants.captureBurstDelay) {
          self.captureNextPhoto()
        }
      } else {
        Task {
          await self.captureState.finishCapture(markComplete: true)
        }
        self.delegate?.didCompleteCapture()
      }
    }
  }
}

// MARK: - Selfie Overlay (Vertical Rectangle)

struct SelfieOverlayView: View {
  let faceInBox: Bool
  let captureProgress: Int

  var body: some View {
    GeometryReader { geo in
      let center = CGPoint(
        x: geo.size.width / 2,
        y: geo.size.height / 2 + SelfieCaptureConstants.verticalOffset
      )

      ZStack {
        // Dimmed background
        Color.black.opacity(0.6)

        // Cut out rectangle for face
        RoundedRectangle(cornerRadius: SelfieCaptureConstants.cornerRadius)
          .frame(
            width: SelfieCaptureConstants.boxWidth,
            height: SelfieCaptureConstants.boxHeight
          )
          .position(center)
          .blendMode(.destinationOut)
      }
      .compositingGroup()

      // Border around face area
      RoundedRectangle(cornerRadius: SelfieCaptureConstants.cornerRadius)
        .stroke(
          faceInBox ? Color.green : Color.white,
          lineWidth: SelfieCaptureConstants.borderWidth
        )
        .frame(
          width: SelfieCaptureConstants.boxWidth,
          height: SelfieCaptureConstants.boxHeight
        )
        .position(center)

      // Capture flash effect
      if captureProgress > 0 {
        Color.white
          .opacity(0.3)
          .ignoresSafeArea()
          .animation(.easeOut(duration: 0.1), value: captureProgress)
      }
    }
    .ignoresSafeArea()
  }
}

// MARK: - Selfie Data for Upload (Multiple Images)

struct SelfieData {
  let images: [UIImage]
  let capturedAt: Date

  func toUploadData() throws -> Data {
    var imageDataArray: [[String: Any]] = []
    
    for image in images {
      guard let jpeg = image.jpegData(compressionQuality: 0.8) else {
        throw SelfieError.compressionFailed
      }
      
      imageDataArray.append([
        "image": jpeg.base64EncodedString(),
        "dimensions": [
          "width": Int(image.size.width),
          "height": Int(image.size.height)
        ]
      ])
    }

    let dict: [String: Any] = [
      "images": imageDataArray,
      "capturedAt": Int64(capturedAt.timeIntervalSince1970 * 1000),
      "imageCount": images.count,
      "faceDetected": true
    ]

    return try JSONSerialization.data(withJSONObject: dict)
  }
}

enum SelfieError: LocalizedError {
  case compressionFailed

  var errorDescription: String? {
    switch self {
    case .compressionFailed:
      return "Failed to process selfie image."
    }
  }
}
