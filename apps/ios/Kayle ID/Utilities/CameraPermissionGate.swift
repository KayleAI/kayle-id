import AVFoundation
import SwiftUI
import UIKit

struct CameraPermissionGate<Destination: View>: View {
  private enum CameraPermissionState {
    case authorized
    case notDetermined
    case deniedOrRestricted
  }

  @Environment(\.scenePhase) private var scenePhase
  @State private var permissionState: CameraPermissionState = .notDetermined

  let onCancel: () -> Void
  private let destination: Destination

  init(
    onCancel: @escaping () -> Void,
    @ViewBuilder destination: () -> Destination
  ) {
    self.onCancel = onCancel
    self.destination = destination()
  }

  var body: some View {
    ZStack {
      switch permissionState {
      case .authorized:
        destination
      case .notDetermined:
        prePermissionView
      case .deniedOrRestricted:
        deniedView
      }
    }
    .onAppear(perform: refreshPermissionState)
    .onChange(of: scenePhase) { newPhase in
      guard newPhase == .active else { return }
      refreshPermissionState()
    }
  }

  private var prePermissionView: some View {
    VStack(alignment: .center, spacing: 16) {
      Spacer()

      VStack(spacing: 12) {
        Text("Enable camera to scan your document")
          .font(.title3).bold()
          .foregroundStyle(.black)

        Text("We use the camera to scan the lines at the bottom of your passport or ID card. This is required to read document data.")
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: 360)

      Spacer()

      VStack(spacing: 12) {
        PrimaryActionButton(title: "Enable camera") {
          requestCameraAccess()
        }

        SecondaryActionButton(title: "Cancel") {
          onCancel()
        }
      }
      .frame(maxWidth: 360)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(16)
    .background(Color.white.ignoresSafeArea())
  }

  private var deniedView: some View {
    VStack(alignment: .center, spacing: 16) {
      Spacer()

      VStack(spacing: 12) {
        Text("Camera access required")
          .font(.title3).bold()
          .foregroundStyle(.black)

        Text("Without camera access, the app can't scan your document and can't read your passport or ID card.")
          .font(.subheadline)
          .foregroundStyle(.black.opacity(0.6))
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: 360)

      Spacer()

      VStack(spacing: 12) {
        PrimaryActionButton(title: "Open Settings") {
          openAppSettings()
        }

        SecondaryActionButton(title: "Cancel") {
          onCancel()
        }
      }
      .frame(maxWidth: 360)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(16)
    .background(Color.white.ignoresSafeArea())
  }

  private func refreshPermissionState() {
    permissionState = mapPermissionState()
  }

  private func requestCameraAccess() {
    AVCaptureDevice.requestAccess(for: .video) { granted in
      DispatchQueue.main.async {
        permissionState = granted ? .authorized : .deniedOrRestricted
      }
    }
  }

  private func openAppSettings() {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    UIApplication.shared.open(url)
  }

  private func mapPermissionState() -> CameraPermissionState {
    if PreviewSupport.isRunningInXcodePreview {
      return .authorized
    }

    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      return .authorized
    case .notDetermined:
      return .notDetermined
    case .denied, .restricted:
      return .deniedOrRestricted
    @unknown default:
      return .deniedOrRestricted
    }
  }
}
