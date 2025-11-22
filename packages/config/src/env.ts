// @ts-expect-error - cloudflare:workers is not typed, but it exists.
import { env as cloudflareEnv } from "cloudflare:workers";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
  },

  clientPrefix: "VITE_",
  client: {
    /* no client variables */
  },

  runtimeEnv: {
    ...(typeof process !== "undefined" ? process?.env : {}),
    ...(typeof import.meta !== "undefined" ? import.meta.env : {}),
    ...cloudflareEnv,
  },

  emptyStringAsUndefined: true,
});
