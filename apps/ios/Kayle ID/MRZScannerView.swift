//
//  MRZScannerView.swift
//

import SwiftUI

struct MRZScannerView: UIViewControllerRepresentable {
  let onValidMRZ: (String) -> Void

  func makeUIViewController(context: Context) -> MRZOCRViewController {
    let vc = MRZOCRViewController()
    vc.onMRZ = { mrz in
      // Validate TD3; if valid, bubble up once.
      guard let res = try? MRZTD3.parseAndValidate(mrz), res.checks.isValid else { return }
      onValidMRZ(mrz)
    }
    return vc
  }

  func updateUIViewController(_ uiViewController: MRZOCRViewController, context: Context) {}
}
