import { env as cloudflareEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
  config({
    path: "../../.env",
    quiet: true,
    debug: false,
  });
}

export const env = createEnv({
  clientPrefix: "PUBLIC_",
  client: {
    /* no client-only variables */
  },

  server: {
    KAYLE_INTERNAL_TOKEN: z.string().min(1),

    // Cloudflare Specific Variables
    API: z.custom<Fetcher>(),
  },

  runtimeEnv: {
    ...(typeof process !== "undefined" ? process?.env : {}),
    ...(typeof import.meta !== "undefined" ? import.meta.env : {}),
    ...(cloudflareEnv as unknown as Record<string, string>),
  },

  emptyStringAsUndefined: true,
});
