import SwiftUI

@main
struct Main: App {
  @State private var pendingQRCode: String?

  var body: some Scene {
    WindowGroup {
      ContentView()
        .onOpenURL { url in
          // Handle kayle-id:// URL scheme
          handleIncomingURL(url)
        }
    }
  }

  private func handleIncomingURL(_ url: URL) {
    // Convert URL to string format expected by QRCodePayload
    // URL format: kayle-id://{"session_id":...}
    // We reconstruct this from the URL
    guard let scheme = url.scheme, scheme == "kayle-id" || scheme == "kayle" else { return }

    // The URL might come as kayle-id://{"session_id":...} or kayle-id:{...}
    // Reconstruct the full kayle-id:// string
    let fullString: String
    if let host = url.host {
      // kayle://host format - host contains the JSON
      fullString = "\(scheme)://\(host)\(url.path)"
    } else {
      // kayle:{...} format - path contains the JSON
      fullString = "\(scheme)://\(url.path)"
    }

    pendingQRCode = fullString
  }
}
