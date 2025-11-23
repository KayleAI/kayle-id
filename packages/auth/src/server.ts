import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
import { redis } from "@kayle-id/database/redis";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey, customSession } from "better-auth/plugins";

const user = {
  modelName: "auth_users",
  deleteUser: {
    // TODO: implement delete user
  },
} satisfies BetterAuthOptions["user"];

const plugins = [
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
] satisfies BetterAuthOptions["plugins"];

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
    updateAge: 60 * 1000, // 60 seconds
    freshAge: 60 * 60 * 1000, // 1 hour
    cookieCache: {
      enabled: true,
      maxAge: 60, // 60 seconds
      strategy: "jwe",
      version: "1",
      refreshCache: {
        updateAge: 60 * 1000, // 60 seconds
      },
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
