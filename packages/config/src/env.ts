import type { R2Bucket } from "@cloudflare/workers-types";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
  config({
    path: "../../../.env",
    quiet: true,
    debug: false,
  });
}

let cloudflareEnv: Record<string, string> = {};

try {
  const cf = "cloudflare:workers";
  cloudflareEnv = (await import(/* @vite-ignore */ cf))?.env ?? {};
} catch {
  // ignore
}

export const env = createEnv({
  clientPrefix: "PUBLIC_",
  client: {
    /* no client-only variables */
  },

  server: {
    KAYLE_INTERNAL_TOKEN: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    REDIS_URL: z.string().min(1),
    REDIS_TOKEN: z.string().min(1),

    // Cloudflare Specific Variables
    STORAGE: z.custom<R2Bucket>(),
  },

  shared: {
    PUBLIC_AUTH_URL: z.string().min(1),
  },

  runtimeEnv: {
    ...(typeof process !== "undefined" ? process?.env : {}),
    ...(typeof import.meta !== "undefined" ? import.meta.env : {}),
    ...cloudflareEnv,
  },

  emptyStringAsUndefined: true,

  skipValidation: process.env.NODE_ENV !== "test",
});
