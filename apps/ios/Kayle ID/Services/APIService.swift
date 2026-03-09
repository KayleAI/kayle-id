import Foundation

/// API service for communicating with the Kayle verification backend.
final class APIService: NSObject, URLSessionDelegate, URLSessionTaskDelegate {
  private let sessionId: String
  private let attemptId: String
  private let mobileWriteToken: String
  private let baseURL: String
  
  /// Sequence counter for message ordering (monotonically increasing)
  private var messageSeq: Int = 0
  
  // URLSession with self as delegate - must be lazy to reference self
  private lazy var urlSession: URLSession = {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 30
    config.timeoutIntervalForResource = 60
    // Allow TLS 1.2+ (default, but be explicit)
    config.tlsMinimumSupportedProtocolVersion = .TLSv12
    // Create session with self as delegate
    // Using nil for delegateQueue lets the system choose an appropriate queue
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  /// Initialize with explicit base URL.
  init(sessionId: String, attemptId: String, mobileWriteToken: String, baseURL: String) {
    self.sessionId = sessionId
    self.attemptId = attemptId
    self.mobileWriteToken = mobileWriteToken
    self.baseURL = baseURL
    super.init()
    // Force lazy initialization to set up delegate
    _ = urlSession
  }

  /// Construct base URL from session ID environment prefix.
  static func baseURL(from _: String) -> String {
    #if DEBUG
    // Local settings for non-App Store builds.
    return "http://100.98.104.67:8787"
    #else
    return "https://api.kayle.id"
    #endif
  }

  static func fetchHandoffPayload(sessionId: String) async throws -> QRCodePayload {
    guard let url = URL(string: "\(baseURL(from: sessionId))/v1/verify/session/\(sessionId)/handoff")
    else {
      throw APIError.invalidResponse
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let (data, response) = try await URLSession.shared.data(for: request)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw APIError.invalidResponse
    }

    guard
      let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw APIError.invalidResponse
    }

    guard (200...299).contains(httpResponse.statusCode) else {
      if
        let error = envelope["error"] as? [String: Any],
        let message = error["message"] as? String
      {
        throw APIError.serverError(message)
      }
      throw APIError.httpError(httpResponse.statusCode)
    }

    guard
      let payload = envelope["data"] as? [String: Any],
      let payloadSessionId = payload["session_id"] as? String,
      let attemptId = payload["attempt_id"] as? String,
      let mobileWriteToken = payload["mobile_write_token"] as? String,
      let expiresAtValue = payload["expires_at"] as? String
    else {
      throw APIError.invalidResponse
    }

    let formatter = ISO8601DateFormatter()
    guard let expiresAt = formatter.date(from: expiresAtValue) else {
      throw APIError.invalidResponse
    }

    return QRCodePayload(
      v: payload["v"] as? Int,
      sessionId: payloadSessionId,
      attemptId: attemptId,
      mobileWriteToken: mobileWriteToken,
      expiresAt: expiresAt
    )
  }

  /// Update the current verification phase.
  func updatePhase(_ phase: AttemptPhase, error: String? = nil) async throws {
    let url = URL(string: "\(baseURL)/v1/verify/sessions/\(sessionId)/phase")!

    var body: [String: Any] = [
      "attempt_id": attemptId,
      "phase": phase.rawValue
    ]
    if let error {
      body["error"] = error
    }

    try await performRequest(url: url, body: body)
  }

  /// Upload encrypted data to the relay.
  func uploadData(type: String, envelope: E2EEEnvelope) async throws {
    let url = URL(string: "\(baseURL)/v1/verify/sessions/\(sessionId)/store")!

    // Get and increment sequence number
    let seq = messageSeq
    messageSeq += 1

    let body: [String: Any] = [
      "attempt_id": attemptId,
      "type": type,
      "seq": seq,
      "e2ee": [
        "ephemeralPublicKey": envelope.ephemeralPublicKey,
        "iv": envelope.iv,
        "ciphertext": envelope.ciphertext
      ]
    ]

    try await performRequest(url: url, body: body)
  }

  // MARK: - Private

  private func performRequest(url: URL, body: [String: Any]) async throws {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(mobileWriteToken)", forHTTPHeaderField: "Authorization")

    let jsonData = try JSONSerialization.data(withJSONObject: body)
    request.httpBody = jsonData

    // Use withCheckedThrowingContinuation to bridge completion handler to async
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      let task = self.urlSession.dataTask(with: request) { data, response, error in
        if let error = error {
          continuation.resume(throwing: APIError.networkError(error))
          return
        }

        guard let httpResponse = response as? HTTPURLResponse,
              let data = data else {
          continuation.resume(throwing: APIError.invalidResponse)
          return
        }

        guard (200...299).contains(httpResponse.statusCode) else {
          Task { @MainActor in
            if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
              continuation.resume(throwing: APIError.serverError(errorResponse.error.message))
            } else {
              continuation.resume(throwing: APIError.httpError(httpResponse.statusCode))
            }
          }
          return
        }

        continuation.resume()
      }
      task.resume()
    }
  }
  
  // MARK: - URLSessionDelegate (SSL Bypass for DEBUG)
  
  // Session-level authentication challenge
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    handleSSLChallenge(challenge, completionHandler: completionHandler)
  }
  
  // Task-level authentication challenge (some challenges come here instead)
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    handleSSLChallenge(challenge, completionHandler: completionHandler)
  }
  
  private func handleSSLChallenge(
    _ challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    #if DEBUG
    // Accept any server certificate in DEBUG builds for self-signed certs
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
       let serverTrust = challenge.protectionSpace.serverTrust {
      let credential = URLCredential(trust: serverTrust)
      completionHandler(.useCredential, credential)
      return
    }
    #endif
    completionHandler(.performDefaultHandling, nil)
  }
}

// MARK: - Error Types

enum APIError: LocalizedError {
  case invalidResponse
  case httpError(Int)
  case serverError(String)
  case networkError(Error)

  var errorDescription: String? {
    switch self {
    case .invalidResponse:
      return "Invalid server response."
    case .httpError(let code):
      return "Server error (HTTP \(code))."
    case .serverError(let message):
      return message
    case .networkError(let error):
      return "Network error: \(error.localizedDescription)"
    }
  }
}

private struct APIErrorResponse: Decodable {
  let error: APIErrorDetail
}

private struct APIErrorDetail: Decodable {
  let code: String
  let message: String
}
