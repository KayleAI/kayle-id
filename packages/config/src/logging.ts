import { createRequestLogger, initLogger, type RequestLogger } from "evlog";

const DEFAULT_PATH = "/";
const MIN_ERROR_STATUS = 400;
const MAX_ERROR_STATUS = 599;

export type SafeRequestLogger = Pick<
  RequestLogger,
  "emit" | "getContext" | "info" | "set" | "warn"
>;
type SafeLogWriter = Pick<SafeRequestLogger, "info" | "warn">;
export type SafeLogLevel = "info" | "warn";
export type SafeRequestLoggerInput =
  | Request
  | {
      headers: Headers;
      method: string;
      path: string;
    };

export type SafeErrorContext = {
  error_code: string;
  error_message: string;
  error_name: string;
  error_fix?: string;
  error_link?: string;
  error_why?: string;
  status?: number;
};

export type SafeErrorContextInput = {
  code: string;
  error: unknown;
  message: string;
  fix?: string;
  link?: string;
  status?: number;
  why?: string;
};

export type SafeLogEventInput = {
  details?: Record<string, unknown>;
  event: string;
  level?: SafeLogLevel;
};

export type SafeLogErrorInput = SafeErrorContextInput &
  Omit<SafeLogEventInput, "level"> & {
    level?: SafeLogLevel;
  };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function isHttpStatus(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= MAX_ERROR_STATUS
  );
}

export function buildSafeErrorContext({
  code,
  error,
  message,
  fix,
  link,
  status,
  why,
}: SafeErrorContextInput): SafeErrorContext {
  const resolvedStatus = status ?? getSafeErrorStatus(error);

  return {
    error_code: code,
    error_message: message,
    error_name: getSafeErrorName(error),
    ...(fix ? { error_fix: fix } : {}),
    ...(link ? { error_link: link } : {}),
    ...(resolvedStatus ? { status: resolvedStatus } : {}),
    ...(why ? { error_why: why } : {}),
  };
}

export function getSafeErrorName(error: unknown): string {
  if (error instanceof Error && error.name) {
    return error.name;
  }

  const record = asRecord(error);
  return typeof record?.name === "string" && record.name.length > 0
    ? record.name
    : "UnknownError";
}

export function getSafeErrorStatus(error: unknown): number | null {
  const record = asRecord(error);

  if (isHttpStatus(record?.status)) {
    return record.status;
  }

  if (isHttpStatus(record?.statusCode)) {
    return record.statusCode;
  }

  return null;
}

export function isErrorStatus(status: number | null | undefined): boolean {
  return typeof status === "number" && status >= MIN_ERROR_STATUS;
}

function resolveSafeRequestLoggerInput(input: SafeRequestLoggerInput): {
  headers: Headers;
  method: string;
  path: string;
} {
  if (input instanceof Request) {
    return {
      headers: input.headers,
      method: input.method,
      path: input.url,
    };
  }

  return input;
}

export function createSafeRequestLogger(
  input: SafeRequestLoggerInput
): SafeRequestLogger {
  const { headers, method, path } = resolveSafeRequestLoggerInput(input);
  const logger = createRequestLogger({
    method,
    path: sanitizeLogPath(path),
  });

  logger.set({
    request_id: resolveRequestId(headers),
  });

  return logger;
}

export function logEvent(
  logger: SafeLogWriter | null | undefined,
  { details, event, level = "info" }: SafeLogEventInput
): void {
  if (!logger) {
    return;
  }

  const context = details ? { ...details, event } : { event };

  if (level === "warn") {
    logger.warn(event, context);
    return;
  }

  logger.info(event, context);
}

export function logSafeError(
  logger: SafeLogWriter | null | undefined,
  {
    code,
    details,
    error,
    event,
    fix,
    level,
    link,
    message,
    status,
    why,
  }: SafeLogErrorInput
): void {
  logEvent(logger, {
    details: {
      ...(details ?? {}),
      ...buildSafeErrorContext({
        code,
        error,
        fix,
        link,
        message,
        status,
        why,
      }),
    },
    event,
    level: level ?? "warn",
  });
}

export function emitSafeRequestLog(
  logger: SafeRequestLogger,
  status: number,
  forceKeep = isErrorStatus(status)
): ReturnType<SafeRequestLogger["emit"]> {
  return logger.emit({
    _forceKeep: forceKeep,
    status,
  });
}

export function initStructuredLogger({
  environment,
  service,
  version,
}: {
  environment?: string;
  service: string;
  version?: string;
}): void {
  initLogger({
    env: {
      environment: environment ?? "development",
      service,
      version,
    },
    pretty: false,
    sampling: {
      keep: [{ status: MIN_ERROR_STATUS }],
    },
    stringify: false,
  });
}

export function resolveRequestId(headers: Headers): string {
  return (
    headers.get("cf-ray") ?? headers.get("x-request-id") ?? crypto.randomUUID()
  );
}

export function sanitizeLogPath(input: string): string {
  try {
    const parsed = new URL(input, "https://kayle.invalid");
    return parsed.pathname || DEFAULT_PATH;
  } catch {
    const [path] = input.split("?");
    return path || DEFAULT_PATH;
  }
}
