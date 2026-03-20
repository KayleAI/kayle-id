import type { Hyperdrive, R2Bucket } from "@cloudflare/workers-types";
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

let cloudflareEnv: Record<string, unknown> = {};

try {
  const cf = "cloudflare:workers";
  cloudflareEnv = ((await import(/* @vite-ignore */ cf))?.env ?? {}) as Record<
    string,
    unknown
  >;
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
    AUTH_SECRET: z.string().min(1),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    // For Redis
    REDIS_URL: z.string().min(1).optional(),
    REDIS_TOKEN: z.string().min(1).optional(),

    // Resend
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().min(1),

    // Cloudflare Specific Variables
    STORAGE: z.custom<R2Bucket>(),
    HYPERDRIVE: z.custom<Hyperdrive>().optional(),
  },

  shared: {
    PUBLIC_AUTH_URL: z.string().min(1),

    PUBLIC_DEVELOPMENT_API_BASE_URL: z.string().url().optional(),
  },

  runtimeEnv: {
    ...(typeof process !== "undefined" ? process?.env : {}),
    ...(typeof import.meta !== "undefined" ? import.meta.env : {}),
    ...(cloudflareEnv as Record<string, string>),
  },

  emptyStringAsUndefined: true,

  // Skip validation in test environment
  skipValidation: process.env.NODE_ENV === "test",
});
