import Foundation
import SwiftUI

enum PreviewSupport {
  static var isRunningInXcodePreview: Bool {
    ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"
  }
}

struct PreviewCameraSurfaceView: View {
  let title: String
  let subtitle: String

  var body: some View {
    Color.black
      .ignoresSafeArea()
  }
}
