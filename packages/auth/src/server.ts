import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const user = {
  modelName: "auth_users",
  deleteUser: {
    // TODO: implement delete user
  },
} satisfies BetterAuthOptions["user"];

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  url: env.PUBLIC_BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: false,
    camelCase: false,
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
  user,
  account: {
    modelName: "auth_accounts",
  },
  session: {
    modelName: "auth_sessions",
  },
  verification: {
    modelName: "auth_verifications",
  },
});

export { auth as server };
