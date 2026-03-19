import {
  buildSafeErrorContext,
  createSafeRequestLogger,
  emitSafeRequestLog,
  initStructuredLogger,
  type SafeErrorContextInput,
  type SafeRequestLogger,
} from "@kayle-id/config/logging";
import pkg from "../package.json" with { type: "json" };

initStructuredLogger({
  environment: process.env.NODE_ENV,
  service: pkg.name,
  version: pkg.version,
});

export type FaceMatcherRequestLogger = SafeRequestLogger;

export function createFaceMatcherRequestLogger(
  request: Request
): FaceMatcherRequestLogger {
  return createSafeRequestLogger({
    headers: request.headers,
    method: request.method,
    path: request.url,
  });
}

export function emitFaceMatcherRequestLog(
  logger: FaceMatcherRequestLogger,
  status: number
): ReturnType<FaceMatcherRequestLogger["emit"]> {
  return emitSafeRequestLog(logger, status);
}

export function logSafeFaceMatcherError(
  logger: FaceMatcherRequestLogger,
  input: SafeErrorContextInput
): void {
  logger.warn(input.code, buildSafeErrorContext(input));
}
