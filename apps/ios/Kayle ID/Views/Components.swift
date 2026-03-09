import SwiftUI

// MARK: - Primary Action Button

struct PrimaryActionButton: View {
  let title: String
  var isDisabled = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(.body, weight: .medium))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .foregroundStyle(.white)
        .background(isDisabled ? Color.black.opacity(0.35) : Color.black)
        .clipShape(Capsule())
        .contentShape(Rectangle())
    }
    .disabled(isDisabled)
    .buttonStyle(.plain)
  }
}

// MARK: - Secondary Action Button

struct SecondaryActionButton: View {
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(.body, weight: .medium))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .foregroundStyle(.black)
        .overlay(
          Capsule()
            .stroke(Color.black.opacity(0.2), lineWidth: 1)
        )
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}
