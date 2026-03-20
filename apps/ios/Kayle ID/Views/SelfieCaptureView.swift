import AVFoundation
import CoreImage
import ImageIO
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
  let onPhotoCaptured: (UIImage, Int, Int) -> Void

  @State private var capturedImages: [UIImage] = []
  @State private var faceInBox = false
  @State private var captureProgress: Int = 0
  @State private var isCapturing = false
  @State private var isProcessing = false
  @State private var statusMessage = "Position your face in the frame"

  var body: some View {
    ZStack {
      SelfieCameraView(
        faceInBox: $faceInBox,
        capturedImages: $capturedImages,
        isCapturing: $isCapturing,
        captureProgress: $captureProgress,
        isProcessing: $isProcessing,
        onPhotoCaptured: onPhotoCaptured
      )
      .ignoresSafeArea()

      SelfieOverlayView(faceInBox: faceInBox, captureProgress: captureProgress)

      if isProcessing {
        Color.black.opacity(0.4).ignoresSafeArea()
        ProgressView("Uploading selfies...")
          .tint(.white)
          .foregroundStyle(.white)
      }

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

        }
        .padding(.horizontal, 24)
        .padding(.bottom, 60)
      }
    }
    .onChange(of: capturedImages) { images in
      if images.count >= SelfieCaptureConstants.captureCount, !isProcessing {
        isProcessing = true
        onCapture(images)
      }
    }
  }

  private var displayText: String {
    if isProcessing {
      return "Uploading selfies..."
    } else if isCapturing {
      return "Hold still..."
    } else if faceInBox {
      return "Perfect! Stay still to capture"
    } else {
      return "Position your face in the frame"
    }
  }

  private var subtitleText: String {
    if isProcessing {
      return "Please wait while we securely upload your photos"
    } else if isCapturing {
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
  @Binding var isProcessing: Bool
  let onPhotoCaptured: (UIImage, Int, Int) -> Void

  func makeUIViewController(context: Context) -> SelfieCameraViewController {
    let controller = SelfieCameraViewController()
    controller.delegate = context.coordinator
    return controller
  }

  func updateUIViewController(_ uiViewController: SelfieCameraViewController, context: Context) {
    // Pass screen dimensions for face-in-box calculations
    uiViewController.updateTargetRect(for: uiViewController.view.bounds.size)
    uiViewController.setCaptureEnabled(!isProcessing)
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
        self.parent.onPhotoCaptured(image, index, SelfieCaptureConstants.captureCount)
        
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

nonisolated private final class SelfieCaptureState: @unchecked Sendable {
  private let queue = DispatchQueue(label: "selfie.capture.state")
  private var isAutoCapturing = false
  private var hasCompletedCapture = false
  private var faceInBoxStartTime: Date?
  private var faceInViewStartTime: Date?
  private var viewSize: CGSize = .zero
  private var targetRect: CGRect = .zero
  private let stabilityDuration: TimeInterval

  init(stabilityDuration: TimeInterval) {
    self.stabilityDuration = stabilityDuration
  }

  func updateLayout(viewSize: CGSize, targetRect: CGRect) {
    queue.sync {
      self.viewSize = viewSize
      self.targetRect = targetRect
    }
  }

  func beginCaptureIfPossible() -> Bool {
    queue.sync {
      guard !isAutoCapturing && !hasCompletedCapture else { return false }
      isAutoCapturing = true
      faceInBoxStartTime = nil
      return true
    }
  }

  func finishCapture(markComplete: Bool) {
    queue.sync {
      isAutoCapturing = false
      if markComplete {
        hasCompletedCapture = true
      }
    }
  }

  func evaluateFace(
    _ face: VNFaceObservation?
  ) -> (faceInBox: Bool, shouldStartCapture: Bool, inViewDuration: TimeInterval) {
    queue.sync {
      guard !isAutoCapturing && !hasCompletedCapture else {
        faceInBoxStartTime = nil
        faceInViewStartTime = nil
        return (false, false, 0)
      }

      guard viewSize.width > 0, viewSize.height > 0 else {
        faceInBoxStartTime = nil
        faceInViewStartTime = nil
        return (false, false, 0)
      }

      guard let face else {
        faceInBoxStartTime = nil
        faceInViewStartTime = nil
        return (false, false, 0)
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
        if faceInViewStartTime == nil {
          faceInViewStartTime = Date()
        }
        if faceInBoxStartTime == nil {
          faceInBoxStartTime = Date()
        } else if let startTime = faceInBoxStartTime,
                  Date().timeIntervalSince(startTime) >= stabilityDuration {
          shouldStartCapture = true
          faceInBoxStartTime = nil
        }
      } else {
        faceInBoxStartTime = nil
        faceInViewStartTime = nil
      }

      let inViewDuration: TimeInterval
      if faceInBox, let start = faceInViewStartTime {
        inViewDuration = Date().timeIntervalSince(start)
      } else {
        inViewDuration = 0
      }

      return (faceInBox, shouldStartCapture, inViewDuration)
    }
  }
}

final class SelfieCameraViewController: UIViewController {
  weak var delegate: SelfieCameraDelegate?

  private let session = AVCaptureSession()
  private let photoOutput = AVCapturePhotoOutput()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let sessionQueue = DispatchQueue(label: "selfie.capture.session")
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private let captureState = SelfieCaptureState(
    stabilityDuration: SelfieCaptureConstants.stabilityDuration
  )
  private let fallbackDuration: TimeInterval = 5
  
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

  func setCaptureEnabled(_ enabled: Bool) {
    sessionQueue.async { [session] in
      if enabled {
        if !session.isRunning {
          session.startRunning()
        }
      } else {
        if session.isRunning {
          session.stopRunning()
        }
      }
    }
  }

  private static let minBrightness: Float = 0.18
  private static let minSharpness: Float = 30

  func updateTargetRect(for size: CGSize) {
    let centerX = size.width / 2
    let centerY = size.height / 2 + SelfieCaptureConstants.verticalOffset
    let targetRect = CGRect(
      x: centerX - SelfieCaptureConstants.boxWidth / 2,
      y: centerY - SelfieCaptureConstants.boxHeight / 2,
      width: SelfieCaptureConstants.boxWidth,
      height: SelfieCaptureConstants.boxHeight
    )
    captureState.updateLayout(viewSize: size, targetRect: targetRect)
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

  private func startAutoCaptureSequence() {
    guard captureState.beginCaptureIfPossible() else { return }
    capturedPhotos = []
    pendingCaptureCount = 0

    delegate?.didStartCapture()
    captureNextPhoto()
  }

  private func captureNextPhoto() {
    guard pendingCaptureCount < SelfieCaptureConstants.captureCount else {
      // All photos captured
      captureState.finishCapture(markComplete: true)
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

    let faces = faceRequest.results ?? []
    if faces.count != 1 {
      DispatchQueue.main.async { [weak self] in
        self?.delegate?.didUpdateFaceInBox(false)
      }
      return
    }

    let face = faces[0]
    let evaluation = captureState.evaluateFace(face)
    let shouldCapture: Bool

    if evaluation.shouldStartCapture {
      if evaluation.inViewDuration >= fallbackDuration {
        shouldCapture = true
      } else {
        shouldCapture = SelfieQuality.isAcceptable(pixelBuffer, face: face)
      }
    } else {
      shouldCapture = false
    }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.delegate?.didUpdateFaceInBox(evaluation.faceInBox)
      if shouldCapture {
        self.startAutoCaptureSequence()
      }
    }
  }
}

nonisolated private enum SelfieQuality {
  static let minBrightness: Float = 0.18
  static let minSharpness: Float = 30

  nonisolated static func isAcceptable(_ pixelBuffer: CVPixelBuffer, face: VNFaceObservation) -> Bool {
    guard let faceBuffer = cropFaceBuffer(pixelBuffer, face: face) else {
      return false
    }
    let brightness = averageLuminance(faceBuffer)
    if brightness < minBrightness {
      return false
    }
    let sharpness = laplacianVariance(faceBuffer)
    if sharpness < minSharpness {
      return false
    }
    return true
  }

  nonisolated private static func cropFaceBuffer(
    _ pixelBuffer: CVPixelBuffer,
    face: VNFaceObservation
  ) -> CVPixelBuffer? {
    let ciImage = CIImage(cvPixelBuffer: pixelBuffer).oriented(.leftMirrored)
    let width = ciImage.extent.width
    let height = ciImage.extent.height
    let faceRect = face.boundingBox
    let cropRect = CGRect(
      x: faceRect.origin.x * width,
      y: (1 - faceRect.origin.y - faceRect.height) * height,
      width: faceRect.width * width,
      height: faceRect.height * height
    ).integral

    let context = CIContext(options: nil)
    guard let cropped = context.createCGImage(ciImage, from: cropRect) else {
      return nil
    }
    return makePixelBuffer(from: cropped)
  }

  nonisolated private static func makePixelBuffer(from cgImage: CGImage) -> CVPixelBuffer? {
    let width = cgImage.width
    let height = cgImage.height
    let attrs = [
      kCVPixelBufferCGImageCompatibilityKey: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey: true
    ] as CFDictionary
    var buffer: CVPixelBuffer?
    guard CVPixelBufferCreate(
      kCFAllocatorDefault,
      width,
      height,
      kCVPixelFormatType_32BGRA,
      attrs,
      &buffer
    ) == kCVReturnSuccess, let pixelBuffer = buffer else {
      return nil
    }
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
    guard let context = CGContext(
      data: CVPixelBufferGetBaseAddress(pixelBuffer),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else {
      return nil
    }
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    return pixelBuffer
  }

  nonisolated private static func averageLuminance(_ pixelBuffer: CVPixelBuffer) -> Float {
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
      return 0
    }
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let buffer = baseAddress.assumingMemoryBound(to: UInt8.self)

    var sum: UInt64 = 0
    let pixelCount = width * height
    for y in 0..<height {
      let row = buffer.advanced(by: y * bytesPerRow)
      for x in 0..<width {
        let pixel = row.advanced(by: x * 4)
        let b = Float(pixel[0])
        let g = Float(pixel[1])
        let r = Float(pixel[2])
        let luminance = 0.114 * b + 0.587 * g + 0.299 * r
        sum += UInt64(luminance)
      }
    }
    return Float(sum) / Float(pixelCount) / 255.0
  }

  nonisolated private static func laplacianVariance(_ pixelBuffer: CVPixelBuffer) -> Float {
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
      return 0
    }
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let buffer = baseAddress.assumingMemoryBound(to: UInt8.self)

    let stride = 4
    var sum: Float = 0
    var sumSq: Float = 0
    var count: Float = 0

    for y in 1..<(height - 1) {
      let rowPrev = buffer.advanced(by: (y - 1) * bytesPerRow)
      let row = buffer.advanced(by: y * bytesPerRow)
      let rowNext = buffer.advanced(by: (y + 1) * bytesPerRow)
      for x in 1..<(width - 1) {
        let idx = x * stride
        let center = luma(row.advanced(by: idx))
        let top = luma(rowPrev.advanced(by: idx))
        let bottom = luma(rowNext.advanced(by: idx))
        let left = luma(row.advanced(by: idx - stride))
        let right = luma(row.advanced(by: idx + stride))
        let lap = (4 * center) - top - bottom - left - right
        sum += lap
        sumSq += lap * lap
        count += 1
      }
    }

    if count == 0 {
      return 0
    }
    let mean = sum / count
    return (sumSq / count) - (mean * mean)
  }

  nonisolated private static func luma(_ pixel: UnsafeMutablePointer<UInt8>) -> Float {
    let b = Float(pixel[0])
    let g = Float(pixel[1])
    let r = Float(pixel[2])
    return 0.114 * b + 0.587 * g + 0.299 * r
  }
}

nonisolated private enum SelfieUploadImageProcessor {
  private static let cropScale: CGFloat = 1.9
  private static let maxDimension: CGFloat = 640
  private static let ciContext = CIContext(options: nil)

  static func prepare(_ image: UIImage) -> UIImage {
    guard let normalized = normalizedCGImage(from: image) else {
      return image
    }

    let cropped = cropToPrimaryFace(normalized) ?? normalized
    let resized = resizeIfNeeded(cropped, maxDimension: maxDimension) ?? cropped
    return UIImage(cgImage: resized)
  }

  private static func normalizedCGImage(from image: UIImage) -> CGImage? {
    guard let cgImage = image.cgImage else {
      return nil
    }

    let ciImage = CIImage(cgImage: cgImage).oriented(
      CGImagePropertyOrientation(image.imageOrientation)
    )

    return ciContext.createCGImage(ciImage, from: ciImage.extent.integral)
  }

  private static func cropToPrimaryFace(_ image: CGImage) -> CGImage? {
    let request = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(cgImage: image)

    do {
      try handler.perform([request])
    } catch {
      return nil
    }

    guard
      let face = request.results?.max(by: {
        $0.boundingBox.width * $0.boundingBox.height
          < $1.boundingBox.width * $1.boundingBox.height
      })
    else {
      return nil
    }

    let faceRect = denormalizeFaceRect(face.boundingBox, image: image)
    let cropRect = expandedSquareCropRect(for: faceRect, image: image)
    return image.cropping(to: cropRect)
  }

  private static func denormalizeFaceRect(
    _ normalizedRect: CGRect,
    image: CGImage
  ) -> CGRect {
    let width = CGFloat(image.width)
    let height = CGFloat(image.height)

    return CGRect(
      x: normalizedRect.origin.x * width,
      y: (1 - normalizedRect.origin.y - normalizedRect.height) * height,
      width: normalizedRect.width * width,
      height: normalizedRect.height * height
    )
  }

  private static func expandedSquareCropRect(
    for faceRect: CGRect,
    image: CGImage
  ) -> CGRect {
    let width = CGFloat(image.width)
    let height = CGFloat(image.height)
    let side = min(max(faceRect.width, faceRect.height) * cropScale, min(width, height))
    let originX = min(max(faceRect.midX - side / 2, 0), width - side)
    let originY = min(max(faceRect.midY - side / 2, 0), height - side)

    return CGRect(
      x: originX,
      y: originY,
      width: side,
      height: side
    ).integral
  }

  private static func resizeIfNeeded(
    _ image: CGImage,
    maxDimension: CGFloat
  ) -> CGImage? {
    let width = CGFloat(image.width)
    let height = CGFloat(image.height)
    let currentMaxDimension = max(width, height)

    guard currentMaxDimension > maxDimension else {
      return image
    }

    let scale = maxDimension / currentMaxDimension
    let targetWidth = max(Int(round(width * scale)), 1)
    let targetHeight = max(Int(round(height * scale)), 1)

    guard
      let context = CGContext(
        data: nil,
        width: targetWidth,
        height: targetHeight,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      )
    else {
      return nil
    }

    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
    return context.makeImage()
  }
}

nonisolated private extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up:
      self = .up
    case .down:
      self = .down
    case .left:
      self = .left
    case .right:
      self = .right
    case .upMirrored:
      self = .upMirrored
    case .downMirrored:
      self = .downMirrored
    case .leftMirrored:
      self = .leftMirrored
    case .rightMirrored:
      self = .rightMirrored
    @unknown default:
      self = .up
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
    let preparedImage = SelfieUploadImageProcessor.prepare(mirrored)
    
    Task { @MainActor [weak self] in
      guard let self else { return }
      
      let currentIndex = self.pendingCaptureCount
      self.capturedPhotos.append(preparedImage)
      self.pendingCaptureCount += 1
      self.delegate?.didCapturePhoto(preparedImage, index: currentIndex)

      // Schedule next capture after delay
      if self.pendingCaptureCount < SelfieCaptureConstants.captureCount {
        DispatchQueue.main.asyncAfter(deadline: .now() + SelfieCaptureConstants.captureBurstDelay) {
          self.captureNextPhoto()
        }
      } else {
        self.captureState.finishCapture(markComplete: true)
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
      guard let jpeg = image.jpegData(compressionQuality: 0.72) else {
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
  case uploadFailed
  case faceNotFound
  case faceMismatch

  var errorDescription: String? {
    switch self {
    case .compressionFailed:
      return "Failed to process selfie image."
    case .uploadFailed:
      return "Failed to upload selfie data."
    case .faceNotFound:
      return "Could not detect a face in the selfie."
    case .faceMismatch:
      return "Selfie does not match the initial capture."
    }
  }
}
