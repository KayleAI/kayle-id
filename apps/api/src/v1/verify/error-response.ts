import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";

export function resolveVerifyErrorMessage(
  code: keyof typeof ERROR_MESSAGES
): string {
  return ERROR_MESSAGES[code]?.description ?? code;
}

export function createVerifyJsonErrorResponse({
  code,
  status,
}: {
  code: keyof typeof ERROR_MESSAGES;
  status: 400 | 404 | 409 | 410;
}) {
  return {
    data: null,
    error: {
      code,
      message: resolveVerifyErrorMessage(code),
    },
    status,
  } as const;
}
