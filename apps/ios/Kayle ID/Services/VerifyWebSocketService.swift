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
  case connectionClosed
  case helloTimedOut
  case serverError(code: String, message: String)
  case reconnectFailed

  var errorDescription: String? {
    switch self {
    case .notConnected:
      return "WebSocket not connected."
    case .invalidURL:
      return "Invalid WebSocket URL."
    case .sendFailed:
      return "Failed to send WebSocket message."
    case .connectionClosed:
      return "WebSocket connection closed unexpectedly."
    case .helloTimedOut:
      return "Timed out waiting for verification handshake."
    case .serverError(_, let message):
      return message
    case .reconnectFailed:
      return "Failed to reconnect verification session."
    }
  }

  var serverErrorCode: String? {
    if case .serverError(let code, _) = self {
      return code
    }
    return nil
  }

  var isNonRetryableAuthFailure: Bool {
    guard let code = serverErrorCode else {
      return false
    }
    return isNonRetryableAuthErrorCode(code)
  }
}

final class VerifyWebSocketService: NSObject, URLSessionWebSocketDelegate {
  private let sessionId: String
  private let attemptId: String
  private let mobileWriteToken: String
  private let baseURL: String
  private let onFatalError: ((VerifyWebSocketError) -> Void)?
  private let codec = VerifyCapnpCodec()

  private var webSocketTask: URLSessionWebSocketTask?
  private let stateQueue = DispatchQueue(label: "com.kayle.verify.websocket.state")
  private let maxReconnectAttempts = 3
  private let helloAckTimeoutNs: UInt64 = 8_000_000_000

  private var isAuthenticated = false
  private var isClosing = false
  private var isReconnecting = false
  private var reconnectAttempt = 0
  private var helloDeviceId: String?
  private var helloAppVersion: String?
  private var pendingHelloContinuation: CheckedContinuation<Void, Error>?
  private var helloTimeoutTask: Task<Void, Never>?

  private lazy var urlSession: URLSession = {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 30
    config.timeoutIntervalForResource = 60
    config.tlsMinimumSupportedProtocolVersion = .TLSv12
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  init(
    sessionId: String,
    attemptId: String,
    mobileWriteToken: String,
    baseURL: String,
    onFatalError: ((VerifyWebSocketError) -> Void)? = nil
  ) {
    self.sessionId = sessionId
    self.attemptId = attemptId
    self.mobileWriteToken = mobileWriteToken
    self.baseURL = baseURL
    self.onFatalError = onFatalError
    super.init()
  }

  func connect() throws {
    guard let url = websocketURL() else {
      throw VerifyWebSocketError.invalidURL
    }
    stateQueue.sync {
      isClosing = false
    }
    startSocket(url: url)
  }

  func sendHello() async throws {
    let (deviceId, appVersion) = await resolveHelloMetadata()
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
    let responsePromise = waitForHelloResponse()
    try await send(data: payload)
    do {
      try await responsePromise
    } catch {
      if let wsError = error as? VerifyWebSocketError {
        throw wsError
      }
      throw VerifyWebSocketError.sendFailed
    }
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

  func disconnect() {
    stateQueue.sync {
      isClosing = true
    }
    resolvePendingHello(.failure(.connectionClosed))
    closeSocket()
  }

  private func closeSocket() {
    webSocketTask?.cancel(with: .goingAway, reason: nil)
    webSocketTask = nil
  }

  private func startSocket(url: URL) {
    closeSocket()
    let task = urlSession.webSocketTask(with: url)
    webSocketTask = task
    task.resume()
    receiveLoop()
  }

  private func resolveHelloMetadata() async -> (String, String) {
    if let cached = stateQueue.sync(execute: { () -> (String, String)? in
      guard let helloDeviceId, let helloAppVersion else {
        return nil
      }
      return (helloDeviceId, helloAppVersion)
    }) {
      return cached
    }

    let (resolvedDeviceId, resolvedAppVersion) = await MainActor.run {
      let id = UIDevice.current.identifierForVendor?.uuidString ?? "ios-unknown-device"
      let version =
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ??
        "unknown"
      return (id, version)
    }

    stateQueue.sync {
      if helloDeviceId == nil {
        helloDeviceId = resolvedDeviceId
      }
      if helloAppVersion == nil {
        helloAppVersion = resolvedAppVersion
      }
    }

    return (resolvedDeviceId, resolvedAppVersion)
  }

  private func waitForHelloResponse() async throws {
    try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<Void, Error>) in
      stateQueue.sync {
        pendingHelloContinuation = continuation
        helloTimeoutTask?.cancel()
        helloTimeoutTask = Task { [weak self] in
          guard let self else { return }
          do {
            try await Task.sleep(nanoseconds: self.helloAckTimeoutNs)
          } catch {
            return
          }
          self.resolvePendingHello(.failure(.helloTimedOut))
        }
      }
    }
  }

  private func resolvePendingHello(_ result: Result<Void, VerifyWebSocketError>) {
    let continuation: CheckedContinuation<Void, Error>? = stateQueue.sync {
      let pending = pendingHelloContinuation
      pendingHelloContinuation = nil
      helloTimeoutTask?.cancel()
      helloTimeoutTask = nil
      return pending
    }

    guard let continuation else {
      return
    }

    switch result {
    case .success:
      continuation.resume()
    case .failure(let error):
      continuation.resume(throwing: error)
    }
  }

  private func isAwaitingHelloResponse() -> Bool {
    stateQueue.sync {
      pendingHelloContinuation != nil
    }
  }

  private func setAuthenticated(_ value: Bool) {
    stateQueue.sync {
      isAuthenticated = value
    }
  }

  private func handleFatalError(_ error: VerifyWebSocketError) {
    Task { @MainActor [onFatalError] in
      onFatalError?(error)
    }
  }

  private func scheduleReconnect(lastErrorCode: String?) {
    let shouldStart = stateQueue.sync { () -> Bool in
      guard !isClosing, !isReconnecting else {
        return false
      }
      let nextAttempt = reconnectAttempt + 1
      guard
        shouldRetryReconnect(
          isAuthenticated: isAuthenticated,
          lastErrorCode: lastErrorCode,
          attempt: nextAttempt,
          maxAttempts: maxReconnectAttempts
        )
      else {
        return false
      }
      isReconnecting = true
      return true
    }

    guard shouldStart else {
      if let lastErrorCode, isNonRetryableAuthErrorCode(lastErrorCode) {
        handleFatalError(.serverError(code: lastErrorCode, message: lastErrorCode))
      }
      return
    }

    Task {
      await reconnectLoop(lastErrorCode: lastErrorCode)
    }
  }

  private func reconnectLoop(lastErrorCode: String?) async {
    var lastError: VerifyWebSocketError = .reconnectFailed

    while true {
      let (attempt, canContinue) = stateQueue.sync { () -> (Int, Bool) in
        let nextAttempt = reconnectAttempt + 1
        let allowed = shouldRetryReconnect(
          isAuthenticated: isAuthenticated,
          lastErrorCode: lastErrorCode,
          attempt: nextAttempt,
          maxAttempts: maxReconnectAttempts
        )
        if allowed {
          reconnectAttempt = nextAttempt
        }
        return (nextAttempt, allowed)
      }

      guard canContinue else {
        break
      }

      let delayNs = UInt64(attempt) * 500_000_000
      try? await Task.sleep(nanoseconds: delayNs)

      do {
        guard let url = websocketURL() else {
          throw VerifyWebSocketError.invalidURL
        }

        startSocket(url: url)
        try await sendHello()

        stateQueue.sync {
          reconnectAttempt = 0
          isReconnecting = false
          isAuthenticated = true
        }

        return
      } catch let wsError as VerifyWebSocketError {
        lastError = wsError
        if wsError.isNonRetryableAuthFailure {
          break
        }
      } catch {
        lastError = .reconnectFailed
      }
    }

    stateQueue.sync {
      isReconnecting = false
    }
    handleFatalError(lastError)
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
            let awaitingHello = self.isAwaitingHelloResponse()
            if awaitingHello {
              if let helloResponse = parseHelloResponse(
                ackMessage: serverMessage.ackMessage,
                errorCode: serverMessage.errorCode,
                errorMessage: serverMessage.errorMessage
              ) {
                switch helloResponse {
                case .success:
                  self.setAuthenticated(true)
                  self.stateQueue.sync {
                    self.reconnectAttempt = 0
                  }
                  self.resolvePendingHello(.success(()))
                case .failure(let code, let message):
                  let error = VerifyWebSocketError.serverError(
                    code: code,
                    message: message
                  )
                  self.resolvePendingHello(.failure(error))
                  if error.isNonRetryableAuthFailure {
                    self.handleFatalError(error)
                  }
                }
                self.receiveLoop()
                return
              }
            }

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
        self.resolvePendingHello(.failure(.connectionClosed))
        self.scheduleReconnect(lastErrorCode: nil)
        return
      }
      self.receiveLoop()
    }
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    if closeCode == .normalClosure || stateQueue.sync(execute: { isClosing }) {
      return
    }

    resolvePendingHello(.failure(.connectionClosed))
    scheduleReconnect(lastErrorCode: nil)
  }
}
