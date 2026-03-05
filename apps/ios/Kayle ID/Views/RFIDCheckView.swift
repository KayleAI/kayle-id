import SwiftUI

/// Standalone RFID check view - can be used in App Clips or main app.
/// NFC is required for Kayle ID, so documents without RFID symbol are not supported.
struct RFIDCheckView: View {
  let onHasRFID: () -> Void

  var body: some View {
    VStack(alignment: .center, spacing: 16) {
      Spacer()

      VStack(alignment: .center, spacing: 12) {
        Text("Do you see this symbol?")
          .font(.title3).bold()
          .foregroundStyle(.black)
      }

      VStack(spacing: 10) {
        // RFID Symbol from asset
        Image("RFIDSymbol")
          .resizable()
          .scaledToFit()
          .frame(width: 150, height: 100)

        Text("Look for this symbol on the cover or photo page of your document.")
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)
          .padding(.horizontal, 32)
      }

      Spacer()

      VStack(spacing: 12) {
        PrimaryActionButton(title: "Yes, I see it") {
          onHasRFID()
        }

        Text("If you don't see this symbol, your document is not supported by Kayle ID.")
          .font(.caption)
          .foregroundStyle(.black.opacity(0.5))
          .multilineTextAlignment(.center)
          .padding(.horizontal, 32)
      }
      .frame(maxWidth: 360)
    }
    .frame(maxWidth: .infinity)
    .padding(16)
    .background(Color.white.ignoresSafeArea())
  }
}
