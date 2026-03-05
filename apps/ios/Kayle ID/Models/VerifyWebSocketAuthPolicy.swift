import Foundation

private let nonRetryableAuthCodes: Set<String> = [
  "HELLO_AUTH_REQUIRED",
  "ATTEMPT_NOT_FOUND",
  "HANDOFF_TOKEN_INVALID",
  "HANDOFF_TOKEN_EXPIRED",
  "HANDOFF_TOKEN_CONSUMED",
  "HANDOFF_DEVICE_MISMATCH",
]

enum VerifyHelloResponse: Equatable {
  case success
  case failure(code: String, message: String)
}

func parseHelloResponse(
  ackMessage: String?,
  errorCode: String?,
  errorMessage: String?
) -> VerifyHelloResponse? {
  if let code = errorCode, !code.isEmpty {
    return .failure(code: code, message: errorMessage ?? code)
  }

  if ackMessage == "hello_ok" {
    return .success
  }

  return nil
}

func isNonRetryableAuthErrorCode(_ code: String) -> Bool {
  nonRetryableAuthCodes.contains(code)
}

func shouldRetryReconnect(
  isAuthenticated: Bool,
  lastErrorCode: String?,
  attempt: Int,
  maxAttempts: Int
) -> Bool {
  guard isAuthenticated, attempt > 0, attempt <= maxAttempts else {
    return false
  }

  if let code = lastErrorCode, isNonRetryableAuthErrorCode(code) {
    return false
  }

  return true
}
