/**
 * Parse an error response from the API.
 * @param response - The response to parse.
 * @param defaultError - The default error message to return if the response is not JSON or the error object is missing the message property.
 * @returns The error message.
 */
export async function parseErrorResponse(
  response: Response,
  defaultError: string
): Promise<string> {
  const text = await response.text();

  try {
    const json = JSON.parse(text) as { error?: { message?: string } };
    return json?.error?.message ?? defaultError;
  } catch {
    return text ?? defaultError;
  }
}
