//
//  ContentView.swift
//  Kayle ID
//
//  Created by Arsen on 02/01/2026.
//

import SwiftUI

struct ContentView: View {
  @State private var isScanning = false
  @State private var mrz: String = ""
  @StateObject private var nfcReader = PassportNFCReader()

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 16) {
        Text("Kayle ID — MRZ Test")
          .font(.title2).bold()

        Button("Scan MRZ") {
          mrz = ""
          isScanning = true
        }
        .buttonStyle(.borderedProminent)

        Group {
          Text("Latest MRZ:")
            .font(.headline)

          Text(mrz.isEmpty ? "—" : mrz)
            .font(.system(.body, design: .monospaced))
            .textSelection(.enabled)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }

        if !mrz.isEmpty {
          Divider()

          VStack(alignment: .leading, spacing: 12) {
            Text("ePassport NFC")
              .font(.headline)

            Button("Scan NFC") {
              nfcReader.start(mrz: mrz)
            }
            .buttonStyle(.borderedProminent)

            Text("Progress: \(progressDots(nfcReader.progress))")
              .font(.system(.body, design: .monospaced))

            if !nfcReader.status.isEmpty {
              Text(nfcReader.status)
                .font(.subheadline)
            }

            if let error = nfcReader.errorMessage {
              Text(error)
                .foregroundStyle(.red)
            }

            if let result = nfcReader.result {
              passportResultView(result)
            }
          }
        }

        Spacer()
      }
      .padding()
      .sheet(isPresented: $isScanning) {
        MRZScannerView { validMRZ in
          mrz = validMRZ
          isScanning = false
        }
      }
    }
  }

  private func progressDots(_ value: Int) -> String {
    let total = 4
    let clamped = max(0, min(total, value))
    return String(repeating: "🟢", count: clamped) + String(repeating: "⚪️", count: total - clamped)
  }

  @ViewBuilder
  private func passportResultView(_ result: PassportReadResult) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      if let dg1MRZ = result.dg1MRZ {
        Text("DG1 (MRZ):")
          .font(.subheadline).bold()
        Text(dg1MRZ)
          .font(.system(.body, design: .monospaced))
          .textSelection(.enabled)
      }

      if let parsed = result.dg1Parsed {
        Text("Parsed Passport Data:")
          .font(.subheadline).bold()
        Text(
          [
            "Document Type: \(parsed.documentType)",
            "Issuing Country: \(parsed.issuingCountry)",
            "Surnames: \(parsed.surnames)",
            "Given Names: \(parsed.givenNames)",
            "Passport Number: \(parsed.passportNumber)",
            "Nationality: \(parsed.nationality)",
            "Birth Date: \(parsed.birthDateYYMMDD)",
            "Sex: \(parsed.sex)",
            "Expiry Date: \(parsed.expiryDateYYMMDD)",
            "Optional Data: \(parsed.optionalData)",
          ].joined(separator: "\n")
        )
        .font(.system(.body, design: .monospaced))
        .textSelection(.enabled)
      }

      Text("Raw Data Groups:")
        .font(.subheadline).bold()

      ForEach(result.dataGroups) { group in
        VStack(alignment: .leading, spacing: 6) {
          Text("\(group.name) — \(group.data.count) bytes")
            .font(.subheadline).bold()
          Text(group.data.base64Lines)
            .font(.system(.footnote, design: .monospaced))
            .textSelection(.enabled)
        }
        .padding(8)
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
      }
    }
  }
}
