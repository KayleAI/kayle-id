export type HandoffPayload = {
  v: number;
  session_id: string;
  attempt_id: string;
  mobile_write_token: string;
  expires_at: string;
};

type HandoffResponse = {
  data: HandoffPayload | null;
  error: {
    code: string;
    message: string;
  } | null;
};

type HandoffRequestError = Error & {
  code: string;
};

function createHandoffError(
  code: string,
  message: string
): HandoffRequestError {
  const error = new Error(message) as HandoffRequestError;
  error.code = code;
  return error;
}

export async function requestHandoffPayload(
  sessionId: string
): Promise<HandoffPayload> {
  const response = await fetch(`/v1/verify/session/${sessionId}/handoff`, {
    method: "POST",
  });

  const payload = (await response.json()) as HandoffResponse;

  if (!(response.ok && payload.data) || payload.error) {
    throw createHandoffError(
      payload.error?.code ?? "UNKNOWN",
      payload.error?.message ?? "Failed to fetch handoff credentials."
    );
  }

  return payload.data;
}
