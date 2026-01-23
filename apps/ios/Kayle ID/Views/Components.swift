import SwiftUI

// MARK: - Primary Action Button

struct PrimaryActionButton: View {
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(.body, weight: .medium))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .foregroundStyle(.white)
        .background(Color.black)
        .clipShape(Capsule())
        .contentShape(Rectangle())
    }
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
