import SwiftUI

@main
struct Main: App {
  @State private var pendingQRCode: String?

  var body: some Scene {
    WindowGroup {
      ContentView()
        .onOpenURL { url in
          // Handle kayle:// URL scheme
          handleIncomingURL(url)
        }
    }
  }

  private func handleIncomingURL(_ url: URL) {
    // Convert URL to string format expected by QRCodePayload
    // URL format: kayle://{"session_id":...}
    // We reconstruct this from the URL
    guard url.scheme == "kayle" else { return }

    // The URL might come as kayle://{"session_id":...} or kayle:{...}
    // Reconstruct the full kayle:// string
    let fullString: String
    if let host = url.host {
      // kayle://host format - host contains the JSON
      fullString = "kayle://\(host)\(url.path)"
    } else {
      // kayle:{...} format - path contains the JSON
      fullString = "kayle://\(url.path)"
    }

    pendingQRCode = fullString
  }
}
