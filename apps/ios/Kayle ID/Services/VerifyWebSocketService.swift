import Foundation
import UIKit

enum VerifyDataKind: Int {
  case dg1 = 0
  case dg2 = 1
  case sod = 2
  case selfie = 3
}

enum VerifyWebSocketError: LocalizedError {
  case notConnected
  case invalidURL
  case sendFailed

  var errorDescription: String? {
    switch self {
    case .notConnected:
      return "WebSocket not connected."
    case .invalidURL:
      return "Invalid WebSocket URL."
    case .sendFailed:
      return "Failed to send WebSocket message."
    }
  }
}

final class VerifyWebSocketService: NSObject, URLSessionWebSocketDelegate {
  private let sessionId: String
  private let attemptId: String
  private let mobileWriteToken: String
  private let baseURL: String
  private let codec = VerifyCapnpCodec()

  private var webSocketTask: URLSessionWebSocketTask?

  private lazy var urlSession: URLSession = {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 30
    config.timeoutIntervalForResource = 60
    config.tlsMinimumSupportedProtocolVersion = .TLSv12
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  init(sessionId: String, attemptId: String, mobileWriteToken: String, baseURL: String) {
    self.sessionId = sessionId
    self.attemptId = attemptId
    self.mobileWriteToken = mobileWriteToken
    self.baseURL = baseURL
    super.init()
  }

  func connect() throws {
    guard let url = websocketURL() else {
      throw VerifyWebSocketError.invalidURL
    }

    let task = urlSession.webSocketTask(with: url)
    webSocketTask = task
    task.resume()
    receiveLoop()
  }

  func sendHello() async throws {
    let (deviceId, appVersion) = await MainActor.run {
      let id = UIDevice.current.identifierForVendor?.uuidString
      let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
      return (id, version)
    }
    guard let payload = codec.encodeHello(
      attemptId: attemptId,
      mobileWriteToken: mobileWriteToken,
      deviceId: deviceId,
      appVersion: appVersion
    ) else {
      throw VerifyWebSocketError.sendFailed
    }
    #if DEBUG
    print("WS -> hello")
    #endif
    try await send(data: payload)
  }

  func sendPhase(_ phase: AttemptPhase, error: String?) async throws {
    guard let payload = codec.encodePhase(phase: phase.rawValue, error: error) else {
      throw VerifyWebSocketError.sendFailed
    }
    #if DEBUG
    print("WS -> phase \(phase.rawValue)")
    #endif
    try await send(data: payload)
  }

  func sendData(
    kind: VerifyDataKind,
    raw: Data,
    index: Int? = nil,
    total: Int? = nil,
    chunkIndex: Int? = nil,
    chunkTotal: Int? = nil
  ) async throws {
    guard let payload = codec.encodeData(
      kind: kind,
      raw: raw,
      index: index,
      total: total,
      chunkIndex: chunkIndex,
      chunkTotal: chunkTotal
    ) else {
      throw VerifyWebSocketError.sendFailed
    }
    #if DEBUG
    let size = raw.count
    let details = "kind=\(kind) size=\(size) index=\(index ?? 0) total=\(total ?? 0) chunk=\(chunkIndex ?? 0)/\(chunkTotal ?? 0)"
    print("WS -> data \(details)")
    #endif
    try await send(data: payload)
  }

  private func websocketURL() -> URL? {
    let scheme: String
    if baseURL.hasPrefix("https://") {
      scheme = "wss"
    } else if baseURL.hasPrefix("http://") {
      scheme = "ws"
    } else {
      return nil
    }

    let hostPath = baseURL
      .replacingOccurrences(of: "https://", with: "")
      .replacingOccurrences(of: "http://", with: "")

    var components = URLComponents()
    components.scheme = scheme
    let hostParts = hostPath.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: true)
    components.host = hostParts.first.map(String.init)
    if hostParts.count > 1, let port = Int(hostParts[1]) {
      components.port = port
    }
    components.path = "/v1/verify/session/\(sessionId)"
#if DEBUG
    components.queryItems = [URLQueryItem(name: "debug", value: "1")]
#endif
    return components.url
  }

  private func send(data: Data) async throws {
    guard let task = webSocketTask else {
      throw VerifyWebSocketError.notConnected
    }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      task.send(.data(data)) { error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume()
        }
      }
    }
  }

  private func receiveLoop() {
    guard let task = webSocketTask else { return }
    task.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let message):
        switch message {
        case .data(let data):
          if let serverMessage = self.codec.decodeServerMessage(data) {
#if DEBUG
            if let ack = serverMessage.ackMessage {
              print("WS <- ack \(ack)")
            } else if let errorMessage = serverMessage.errorMessage {
              let code = serverMessage.errorCode ?? "unknown"
              print("WS <- error \(code) \(errorMessage)")
            } else {
              print("WS <- message")
            }
#endif
            if let error = serverMessage.errorMessage {
              let code = serverMessage.errorCode ?? "unknown"
              print("WebSocket error: \(code) \(error)")
            }
          }
        case .string(let text):
          print("Unexpected WebSocket text: \(text)")
        @unknown default:
          break
        }
      case .failure(let error):
        print("WebSocket receive error: \(error)")
      }
      self.receiveLoop()
    }
  }
}
