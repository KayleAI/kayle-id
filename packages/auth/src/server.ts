import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { redis } from "@kayle-id/database/redis";
import { auth as authSchema } from "@kayle-id/database/schema";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey, customSession, openAPI } from "better-auth/plugins";
import { magic } from "./magic";

const user = {
  modelName: "auth_users",
  deleteUser: {
    // TODO: implement delete user
  },
} satisfies BetterAuthOptions["user"];

const plugins = [
  ...(process.env.NODE_ENV !== "production" ? [openAPI()] : []),
  apiKey({
    apiKeyHeaders: "authorization",
    customAPIKeyGetter({ request }) {
      if (!request) {
        return null;
      }

      const headers = new Headers(request.headers);
      const authorization = headers.get("authorization");
      if (!authorization) {
        return null;
      }
      return authorization.split(" ")[1] ?? null;
    },
    defaultPrefix: "kk_",
    requireName: true,
    enableSessionForAPIKeys: false,
    storage:
      process.env.NODE_ENV === "production" ? "secondary-storage" : undefined,
    ...(process.env.NODE_ENV === "production"
      ? { fallbackToDatabase: true }
      : {}),
    schema: {
      apikey: {
        modelName: "auth_api_keys",
      },
    },
  }),
  magic({
    expiresIn: 15 * 60, // 15 minutes
    sendMagicOtpAuth: async ({ email, otp, url, type }) => {
      if (process.env.NODE_ENV === "development") {
        console.log("Sending magic-otp auth to", email);
        console.log("OTP:", otp);
        console.log("URL:", url);
        console.log("Type:", type);
        return;
      }

      // TODO: Integrate with email service
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  }),
] satisfies BetterAuthOptions["plugins"];

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: false,
    camelCase: false,
    schema: authSchema,
  }),
  basePath: "/v1/auth",
  experimental: {
    // Eventually we'll want to enable joins but for now we're facing an issue with them not.
    joins: false,
  },
  emailAndPassword: {
    enabled: process.env.NODE_ENV === "test",
    autoSignIn: true,
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
    updateAge: 60 * 1000, // 60 seconds
    freshAge: 60 * 60 * 1000, // 1 hour
    cookieCache: {
      enabled: true,
      maxAge: 60, // 60 seconds
      strategy: "jwe",
      version: "1",
      refreshCache: true,
    },
  },
  verification: {
    modelName: "auth_verifications",
  },
  ...(process.env.NODE_ENV === "production"
    ? // Only enable secondary storage in production
      {
        secondaryStorage: {
          get: async (key) => await redis.get(key),
          set: async (key, value, ttl) => {
            if (ttl) {
              await redis.set(key, value, { ex: ttl });
            } else {
              await redis.set(key, value);
            }
          },
          delete: async (key) => {
            await redis.del(key);
          },
        },
      }
    : {}),

  plugins: [
    ...plugins,
    customSession(
      // biome-ignore lint/nursery/noShadow: this is fine
      // biome-ignore lint/suspicious/useAwait: this is fine
      async ({ user, session }) => {
        // Extend the session with more fields
        return {
          user,
          session,
        };
      },
      {
        plugins,
        user,
      }
    ),
  ],
});

export { auth as server };
