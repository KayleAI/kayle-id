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
}
