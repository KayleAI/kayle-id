import {
  buildSafeErrorContext,
  createSafeRequestLogger,
  emitSafeRequestLog,
  getSafeErrorStatus,
  initStructuredLogger,
  type SafeErrorContextInput,
  type SafeRequestLogger,
} from "@kayle-id/config/logging";
import type { Context, MiddlewareHandler } from "hono";
import { config } from "@/config";

const REQUEST_LOG_KEY = "log";
const REQUEST_LOG_EMITTED_KEY = "request_log_emitted";
const REQUEST_LOG_MANUAL_EMIT_KEY = "request_log_manual_emit";

type ApiLoggingVariables = {
  log: SafeRequestLogger;
  request_log_emitted: boolean;
  request_log_manual_emit: boolean;
};

type ApiLoggingContext = Context<{
  Variables: ApiLoggingVariables;
}>;

initStructuredLogger({
  environment: config.environment,
  service: "kayle-id-api",
  version: config.version,
});

function getLoggingContext(c: Context): ApiLoggingContext {
  return c as ApiLoggingContext;
}

export type ApiRequestLogger = SafeRequestLogger;

export function emitRequestLog(
  c: Context,
  status: number
): ReturnType<SafeRequestLogger["emit"]> {
  const loggingContext = getLoggingContext(c);

  if (loggingContext.get(REQUEST_LOG_EMITTED_KEY)) {
    return null;
  }

  const emitted = emitSafeRequestLog(
    loggingContext.get(REQUEST_LOG_KEY),
    status
  );
  loggingContext.set(REQUEST_LOG_EMITTED_KEY, true);
  return emitted;
}

export function getRequestLogger(c: Context): ApiRequestLogger {
  return getLoggingContext(c).get(REQUEST_LOG_KEY);
}

export function logSafeError(
  logger: ApiRequestLogger,
  input: SafeErrorContextInput
): void {
  logger.warn(input.code, buildSafeErrorContext(input));
}

export function markRequestLogForManualEmit(c: Context): void {
  getLoggingContext(c).set(REQUEST_LOG_MANUAL_EMIT_KEY, true);
}

export function requestLoggingMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const loggingContext = getLoggingContext(c);
    const existingLogger = loggingContext.get(REQUEST_LOG_KEY);

    if (existingLogger) {
      await next();
      return;
    }

    const logger = createSafeRequestLogger({
      headers: c.req.raw.headers,
      method: c.req.method,
      path: c.req.path,
    });

    loggingContext.set(REQUEST_LOG_KEY, logger);
    loggingContext.set(REQUEST_LOG_EMITTED_KEY, false);
    loggingContext.set(REQUEST_LOG_MANUAL_EMIT_KEY, false);

    try {
      await next();

      if (loggingContext.get(REQUEST_LOG_MANUAL_EMIT_KEY)) {
        return;
      }

      emitRequestLog(c, c.res.status);
    } catch (error) {
      const status = getSafeErrorStatus(error) ?? 500;

      logSafeError(logger, {
        code: "request_failed",
        error,
        message: "The request failed before a response was returned.",
        status,
      });
      emitRequestLog(c, status);
      throw error;
    }
  };
}
