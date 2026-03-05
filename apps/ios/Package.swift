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
      path: "Kayle ID",
      sources: [
        "Models/MRZResult.swift",
        "Models/QRCodePayload.swift",
        "Models/VerifyWebSocketAuthPolicy.swift",
        "Utilities/MRZParser.swift",
      ]
    ),
    .testTarget(
      name: "KayleIDModelsTests",
      dependencies: ["KayleIDModels"],
      path: "Kayle IDTests",
      sources: [
        "MRZParserTests.swift",
        "QRCodePayloadTests.swift",
        "VerifyWebSocketAuthPolicyTests.swift",
      ]
    ),
  ]
)
