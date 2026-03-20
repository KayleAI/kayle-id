import SwiftUI

struct UploadingView: View {
  let progress: Double
  let status: String

  var body: some View {
    VStack(spacing: 24) {
      Spacer()

      VStack(spacing: 16) {
        ProgressView()
          .scaleEffect(1.5)
          .tint(.black)

        Text("Uploading your data")
          .font(.headline)
          .foregroundStyle(.black)

        Text(status)
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)

        if progress > 0 {
          ProgressView(value: progress)
            .progressViewStyle(.linear)
            .frame(maxWidth: 200)
            .padding(.top, 8)
        }
      }

      Spacer()

      Text("Please don't close the app")
        .font(.caption)
        .foregroundStyle(.black.opacity(0.5))
        .padding(.bottom, 32)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(16)
    .background(Color.white.ignoresSafeArea())
  }
}
