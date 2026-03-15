import SwiftUI

@main
struct Main: App {
  @State private var pendingQRCode: String?

  var body: some Scene {
    WindowGroup {
      ContentView(pendingQRCode: $pendingQRCode)
        .onOpenURL { url in
          // Handle kayle-id:// URL scheme
          handleIncomingURL(url)
        }
    }
  }

  private func handleIncomingURL(_ url: URL) {
    guard let scheme = url.scheme, scheme == "kayle-id" || scheme == "kayle" else { return }
    pendingQRCode = url.absoluteString
  }
}
