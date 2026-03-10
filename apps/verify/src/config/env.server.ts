import { env as cloudflareEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * This is the root environment variable object that is used to access all the environment variables.
 */
export const env = createEnv({
  server: {
    API: z.custom<Fetcher>(),
  },

  runtimeEnv: {
    ...(typeof process !== "undefined" ? process?.env : {}),
    ...(cloudflareEnv as unknown as Record<string, string>),
  },

  emptyStringAsUndefined: true,
});
