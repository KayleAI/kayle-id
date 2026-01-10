import AVFoundation
import UIKit
import Vision

// MARK: - Minimal MRZ OCR (Apple Vision) from live camera frames

final class MRZOCRViewController: UIViewController, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let session = AVCaptureSession()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let sessionQueue = DispatchQueue(label: "mrz.capture.session")

  private var isProcessing = false
  private var lastMRZ: String?
  var onMRZ: ((String) -> Void)?

  private lazy var textRequest: VNRecognizeTextRequest = {
    let req = VNRecognizeTextRequest { [weak self] request, error in
      guard let self else { return }
      defer { self.isProcessing = false }

      if let error { print("Vision error:", error); return }
      guard let results = request.results as? [VNRecognizedTextObservation] else { return }

      // Collect best candidates, prioritise confident lines.
      let lines = results
        .compactMap { $0.topCandidates(1).first }
        .filter { $0.confidence >= 0.4 }
        .map(\.string)

      // Heuristic: MRZ uses < heavily and is usually 2 (passport) or 3 (ID card) lines.
      // We join lines, then attempt to extract MRZ-shaped lines.
      let candidate = Self.extractMRZ(from: lines)
      guard let mrz = candidate else { return }

      if mrz != lastMRZ {
        lastMRZ = mrz
        DispatchQueue.main.async {
          self.onMRZ?(mrz)
        }
      }
    }

    // Accuracy over speed for MRZ
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    // OCR tends to preserve < better without aggressive corrections.
    // If needed, you can try: req.minimumTextHeight = 0.03 (iOS 16+)
    return req
  }()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    setupCamera()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    sessionQueue.async { [session] in
      guard !session.isRunning else { return }
      session.startRunning()
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sessionQueue.async { [session] in
      guard session.isRunning else { return }
      session.stopRunning()
    }
  }

  private func setupCamera() {
    session.beginConfiguration()
    session.sessionPreset = .high

    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input)
    else {
      print("No camera / cannot add input")
      session.commitConfiguration()
      return
    }

    session.addInput(input)

    // Preview layer (optional but useful)
    let preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspectFill
    preview.frame = view.bounds
    view.layer.addSublayer(preview)

    // Video output
    videoOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ]
    videoOutput.alwaysDiscardsLateVideoFrames = true
    videoOutput.setSampleBufferDelegate(self, queue: DispatchQueue(label: "mrz.ocr.queue"))

    guard session.canAddOutput(videoOutput) else {
      print("Cannot add output")
      session.commitConfiguration()
      return
    }
    session.addOutput(videoOutput)

    // Prefer portrait; adjust as needed.
    if let conn = videoOutput.connection(with: .video) {
      if #available(iOS 17.0, *) {
        if conn.isVideoRotationAngleSupported(90) {
          conn.videoRotationAngle = 90
        }
      } else {
        if conn.isVideoOrientationSupported {
          conn.videoOrientation = .portrait
        }
      }
    }

    session.commitConfiguration()
  }

  // MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection,
  ) {
    guard !isProcessing else { return }
    isProcessing = true

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      isProcessing = false
      return
    }

    // Orientation: adjust if you support landscape.
    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])

    do {
      try handler.perform([textRequest])
    } catch {
      isProcessing = false
      print("Handler error:", error)
    }
  }

  // MARK: - MRZ extraction helpers

  /// Attempts to find MRZ lines inside OCR output.
  /// Returns 2-line MRZ joined by newline when found.
  private static func extractMRZ(from lines: [String]) -> String? {
    // Normalise: remove spaces, uppercase, keep < and A-Z0-9.
    let normalised = lines.map { normaliseMRZish($0) }.filter { !$0.isEmpty }

    // MRZ lines usually contain many '<' and are long-ish.
    let mrzLike = normalised
      .filter { $0.count >= 25 && $0.contains("<<") }

    // Try to find two consecutive-ish MRZ lines (passport TD3 is 2 lines of 44 chars)
    // We don't assume exact 44 here because OCR can drop chars.
    if mrzLike.count >= 2 {
      // Take the two best by: most '<' then length.
      let ranked = mrzLike.sorted {
        scoreMRZLine($0) > scoreMRZLine($1)
      }
      let l1 = ranked[0]
      let l2 = ranked[1]

      // Basic plausibility checks
      if l1.count >= 30, l2.count >= 30 {
        return "\(l1)\n\(l2)"
      }
    }

    return nil
  }

  private static func normaliseMRZish(_ s: String) -> String {
    let up = s.uppercased().replacingOccurrences(of: " ", with: "")
    let allowed = up.filter { ch in
      (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") || ch == "<"
    }
    // Common OCR confusions: replace some obvious ones cautiously
    // (tweak based on observed errors)
    return String(allowed)
  }

  private static func scoreMRZLine(_ s: String) -> Int {
    let lt = s.count(where: { $0 == "<" })
    return lt * 10 + s.count
  }
}
