nonisolated func shouldHandleAttemptScopedEvent(
  currentAttemptId: String?,
  eventAttemptId: String?
) -> Bool {
  guard let currentAttemptId else {
    return false
  }

  guard let eventAttemptId else {
    return true
  }

  return currentAttemptId == eventAttemptId
}
