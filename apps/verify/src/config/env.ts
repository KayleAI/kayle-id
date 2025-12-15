import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * This is the root environment variable object that is used to access all the environment variables.
 */
export const env = createEnv({
  clientPrefix: "PUBLIC_",
  client: {
    /**
     * Depends on environment, defaults to `127.0.0.1:8787` in development.
     */
    PUBLIC_API_HOST: z.string().min(1).default("127.0.0.1:8787"),

    /**
     * Depends on environment, defaults to `ws` in development and `wss` in production.
     */
    PUBLIC_API_PROTOCOL: z.enum(["ws", "wss"]).optional(),
  },

  runtimeEnv: {
    ...(typeof process !== "undefined" ? process?.env : {}),
    ...(typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env: Record<string, string> })?.env
      ? (import.meta as unknown as { env: Record<string, string> }).env
      : {}),
  },

  emptyStringAsUndefined: true,
});
