import { env } from "@kayle-id/config/env";
import { createHMAC } from "@/functions/hmac";
import { generateRandomString } from "@/utils/generate-id";

export function generateMobileWriteTokenSeed(): string {
  return generateRandomString(64);
}

export function deriveMobileWriteToken({
  sessionId,
  attemptId,
  issuedAt,
  seed,
}: {
  sessionId: string;
  attemptId: string;
  issuedAt: Date;
  seed: string;
}): Promise<string> {
  return createHMAC(
    `verify_handoff_token_v1|${sessionId}|${attemptId}|${issuedAt.toISOString()}|${seed}`,
    {
      secret: env.AUTH_SECRET,
    }
  );
}

export function hashMobileWriteToken(token: string): Promise<string> {
  return createHMAC(token, {
    secret: env.AUTH_SECRET,
  });
}

export function hashMobileDeviceId(deviceId: string): Promise<string> {
  return createHMAC(deviceId, {
    secret: env.AUTH_SECRET,
  });
}
