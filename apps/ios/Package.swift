// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "KayleIDModelTests",
  platforms: [
    .iOS(.v16),
    .macOS(.v14),
  ],
  products: [
    .library(
      name: "KayleIDModels",
      targets: ["KayleIDModels"]
    ),
  ],
  targets: [
    .target(
      name: "KayleIDModels",
      path: "Kayle ID/Models",
      exclude: [
        "MRZResult.swift",
        "VerificationSession.swift",
      ],
      sources: [
        "QRCodePayload.swift",
        "VerifyWebSocketAuthPolicy.swift",
      ]
    ),
    .testTarget(
      name: "KayleIDModelsTests",
      dependencies: ["KayleIDModels"],
      path: "Kayle IDTests",
      sources: [
        "QRCodePayloadTests.swift",
        "VerifyWebSocketAuthPolicyTests.swift",
      ]
    ),
  ]
)
