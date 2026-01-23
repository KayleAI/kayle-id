import SwiftUI

/// Standalone NFC reading view - can be used in App Clips or main app.
struct NFCReadingView: View {
  @ObservedObject var nfcReader: PassportNFCReader
  /// Pre-computed MRZ key for BAC authentication (document number + birth date + expiry date with check digits)
  let mrzKey: String
  let cardAccessNumber: String?
  let onComplete: (PassportReadResult) -> Void

  @State private var hasStarted = false

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Spacer()

      VStack(alignment: .center, spacing: 10) {
        Text(nfcInstructionText)
          .font(.headline)
          .foregroundStyle(.black)
          .multilineTextAlignment(.center)

        Text("This can take up to a minute.")
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)

        if let error = nfcReader.errorMessage {
          Text(error)
            .foregroundStyle(.red)
            .multilineTextAlignment(.center)
            .padding(.top, 8)
        } else if !nfcReader.status.isEmpty {
          Text(nfcReader.status)
            .font(.subheadline)
            .foregroundStyle(.black.opacity(0.6))
            .multilineTextAlignment(.center)
            .padding(.top, 8)
        }

        // Progress indicator
        if nfcReader.progress > 0 && nfcReader.progress < 4 {
          ProgressView(value: Double(nfcReader.progress), total: 4)
            .progressViewStyle(.linear)
            .padding(.top, 16)
            .padding(.horizontal, 32)
        }
      }
      .frame(maxWidth: .infinity)

      Spacer()

      VStack(spacing: 12) {
        if nfcReader.errorMessage != nil {
          PrimaryActionButton(title: "Try Again") {
            hasStarted = false
            nfcReader.start(mrzKey: mrzKey, cardAccessNumber: cardAccessNumber)
          }
        }
      }
    }
    .padding(16)
    .onAppear {
      guard !hasStarted else { return }
      hasStarted = true
      // Start NFC reading on main thread
      DispatchQueue.main.async {
        nfcReader.start(mrzKey: mrzKey, cardAccessNumber: cardAccessNumber)
      }
    }
    .onChange(of: nfcReader.result) { result in
      if let result {
        onComplete(result)
      }
    }
  }

  private var nfcInstructionText: String {
    "Keep your iPhone close to your document."
  }
}
