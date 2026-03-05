import SwiftUI

/// Standalone MRZ scanner view - can be used in App Clips or main app.
/// Scans and validates Machine Readable Zone (MRZ) from passport/ID documents.
struct MRZScannerView: UIViewControllerRepresentable {
  let onValidMRZ: (String, MRZResult, String?) -> Void

  func makeUIViewController(context: Context) -> MRZOCRViewController {
    let vc = MRZOCRViewController()
    vc.onScan = { mrz, can in
      guard
        let res = try? MRZParser.parseAndValidate(mrz),
        res.format == .td3,
        res.checks.isValid
      else {
        return
      }
      onValidMRZ(mrz, res, can)
    }
    return vc
  }

  func updateUIViewController(_ uiViewController: MRZOCRViewController, context: Context) {}
}

// MARK: - MRZ Scan Overlay

struct MRZScanOverlayView: View {
  let isLocked: Bool
  private let cornerRadius: CGFloat = 12
  private let borderWidth: CGFloat = 6
  private let overlayOpacity: CGFloat = 0.55

  var body: some View {
    GeometryReader { geo in
      let inset: CGFloat = 16
      let windowInsets = windowSafeAreaInsets
      let safeTop = max(geo.safeAreaInsets.top, windowInsets.top)
      let safeLeading = max(geo.safeAreaInsets.leading, windowInsets.left)
      let safeTrailing = max(geo.safeAreaInsets.trailing, windowInsets.right)
      let safeWidth = geo.size.width - safeLeading - safeTrailing
      let boxWidth = max(0, safeWidth - inset * 2)
      let boxHeight = max(0, boxWidth * 0.75)
      let boxTop = safeTop + inset
      let boxCenter = CGPoint(x: geo.size.width / 2, y: boxTop + boxHeight / 2)

      ZStack {
        Color.black.opacity(overlayOpacity)

        RoundedRectangle(cornerRadius: cornerRadius)
          .frame(width: boxWidth, height: boxHeight)
          .position(boxCenter)
          .blendMode(.destinationOut)
      }
      .compositingGroup()
      .overlay(
        RoundedRectangle(cornerRadius: cornerRadius)
          .stroke(isLocked ? Color.green : Color.white, lineWidth: borderWidth)
          .frame(width: boxWidth, height: boxHeight)
          .position(boxCenter)
      )
    }
    .ignoresSafeArea()
  }

  private var windowSafeAreaInsets: UIEdgeInsets {
    guard
      let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
      let window = scene.windows.first(where: { $0.isKeyWindow })
    else {
      return .zero
    }
    return window.safeAreaInsets
  }
}
