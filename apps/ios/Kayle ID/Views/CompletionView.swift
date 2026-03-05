import SwiftUI

struct CompletionView: View {
  let isSuccess: Bool
  let message: String
  let onDone: () -> Void

  var body: some View {
    VStack(spacing: 24) {
      Spacer()

      VStack(spacing: 16) {
        Image(systemName: isSuccess ? "checkmark.circle.fill" : "xmark.circle.fill")
          .font(.system(size: 80))
          .foregroundStyle(isSuccess ? .green : .red)

        Text(isSuccess ? "Verification Complete" : "Verification Failed")
          .font(.title2).bold()
          .foregroundStyle(.black)

        Text(message)
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)
          .frame(maxWidth: 300)
      }

      Spacer()

      PrimaryActionButton(title: "Done") {
        onDone()
      }
      .frame(maxWidth: 300)
      .padding(.bottom, 32)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(16)
    .background(Color.white.ignoresSafeArea())
  }
}
