//
//  ContentView.swift
//

import SwiftUI

struct ContentView: View {
  private enum ScanStep: Int {
    case welcome
    case mrz
    case nfc
    case result
  }

  @State private var step: ScanStep = .welcome
  @State private var mrz: String = ""
  @StateObject private var nfcReader = PassportNFCReader()
  @State private var hasStartedNFC = false
  @State private var isNFCActive = false
  private var hasResult: Bool { nfcReader.result != nil }

  var body: some View {
    NavigationStack {
      ZStack {
        Color.white.ignoresSafeArea()

        VStack(alignment: .leading, spacing: 16) {
          switch step {
          case .welcome:
            Spacer()

          VStack(alignment: .center, spacing: 12) {
            Image("Logo")
              .resizable()
              .scaledToFit()
              .frame(width: 96, height: 96)
              .clipShape(RoundedRectangle(cornerRadius: 20))
              .overlay(
                RoundedRectangle(cornerRadius: 20)
                  .stroke(Color.black.opacity(0.1), lineWidth: 1)
              )

            Text("Let’s verify your passport")
              .font(.title3).bold()
              .foregroundStyle(.black)

            Text("You’ll scan the photo page and then tap your passport to read the chip. This takes about a minute.")
              .font(.subheadline)
              .foregroundStyle(.black.opacity(0.6))
              .multilineTextAlignment(.center)
          }
            .frame(maxWidth: .infinity)

            Spacer()

            PrimaryActionButton(title: "Continue") {
              step = .mrz
            }

        case .mrz:
          Text("Scan your photo page")
            .font(.headline)
            .foregroundStyle(.black)

          MRZScannerView { validMRZ in
            mrz = validMRZ
            step = .nfc
          }
          .clipShape(RoundedRectangle(cornerRadius: 16))
          .frame(maxWidth: .infinity)
          .aspectRatio(4.0 / 3.0, contentMode: .fit)

          Text("Scan your passport photo page.")
            .font(.subheadline)
            .foregroundStyle(.black.opacity(0.6))

        case .nfc:
          Spacer()

          VStack(alignment: .center, spacing: 10) {
            Text("Keep your iPhone close to the passport.")
              .font(.headline)
              .foregroundStyle(.black)
              .multilineTextAlignment(.center)

            Text("This can take up to a minute.")
              .font(.subheadline)
              .foregroundStyle(.black.opacity(0.6))
              .multilineTextAlignment(.center)

            if let error = nfcReader.errorMessage {
              Text(error)
                .foregroundStyle(.black)
                .multilineTextAlignment(.center)
            } else if !nfcReader.status.isEmpty {
              Text(nfcReader.status)
                .font(.subheadline)
                .foregroundStyle(.black.opacity(0.6))
                .multilineTextAlignment(.center)
            }
          }
          .frame(maxWidth: .infinity)

          Spacer()

          PrimaryActionButton(title: "Try Again") {
            guard !isNFCActive else { return }
            isNFCActive = true
            nfcReader.start(mrz: mrz)
          }
          .disabled(isNFCActive)
          .opacity(isNFCActive ? 0.5 : 1.0)

          case .result:
            if let result = nfcReader.result {
              passportResultView(result)
            }

            Spacer()

            PrimaryActionButton(title: "Scan Another Passport") {
              resetToMRZ()
            }
          }

        }
        .padding()
      .onChange(of: step) { newStep in
        guard newStep == .nfc, !hasStartedNFC else { return }
        hasStartedNFC = true
        isNFCActive = true
        nfcReader.start(mrz: mrz)
      }
      .onChange(of: hasResult) { newValue in
        if newValue {
          isNFCActive = false
          step = .result
        }
      }
      .onChange(of: nfcReader.errorMessage) { newValue in
        if newValue != nil {
          isNFCActive = false
        }
      }
      }
    }
    .tint(.black)
  }

  private func resetToMRZ() {
    mrz = ""
    hasStartedNFC = false
    isNFCActive = false
    step = .mrz
  }

  @ViewBuilder
  private func passportResultView(_ result: PassportReadResult) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Passport Details")
        .font(.headline)
        .foregroundStyle(.black)

      if let image = result.passportImage {
        Image(uiImage: image)
          .resizable()
          .scaledToFit()
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .overlay(
            RoundedRectangle(cornerRadius: 12)
              .stroke(Color.black.opacity(0.1), lineWidth: 1)
          )
      }

      if let parsed = result.dg1Parsed {
        VStack(alignment: .leading, spacing: 10) {
          dataRow("Name", "\(parsed.givenNames) \(parsed.surnames)")
          dataRow("Passport Number", parsed.passportNumber)
          dataRow("Nationality", parsed.nationality)
          dataRow("Date of Birth", parsed.birthDateYYMMDD)
          dataRow("Sex", parsed.sex)
          dataRow("Expiry Date", parsed.expiryDateYYMMDD)
          dataRow("Issuing Country", parsed.issuingCountry)
          dataRow("Document Type", parsed.documentType)
        }
        .padding(12)
        .overlay(
          RoundedRectangle(cornerRadius: 12)
            .stroke(Color.black.opacity(0.1), lineWidth: 1)
        )
      } else if let dg1MRZ = result.dg1MRZ {
        Text(dg1MRZ)
          .font(.system(.body, design: .monospaced))
          .textSelection(.enabled)
          .foregroundStyle(.black)
      }
    }
  }

  private func dataRow(_ label: String, _ value: String) -> some View {
    HStack(alignment: .top) {
      Text(label)
        .font(.subheadline)
        .foregroundStyle(.black.opacity(0.6))
        .frame(width: 140, alignment: .leading)

      Text(value)
        .font(.subheadline)
        .foregroundStyle(.black)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

private struct PrimaryActionButton: View {
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
