import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  url: env.PUBLIC_BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  experimental: {
    joins: true,
  },
  appName: "Kayle ID",
  advanced: {
    cookiePrefix: "kayle-id",
    database: {
      generateId: "uuid",
    },
  },
  telemetry: {
    debug: false,
    enabled: false,
  },
});

export { auth as server };
