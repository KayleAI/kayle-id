import { env } from "@kayle-id/config/env";
import { db } from "@kayle-id/database/drizzle";
//import { redis } from "@kayle-id/database/redis";
import { auth as authSchema } from "@kayle-id/database/schema";
import {
  auth_organization_members,
  auth_organizations,
} from "@kayle-id/database/schema/auth";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { customSession, openAPI, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { magic } from "./magic";
import type { Organization } from "./types";

const user = {
  modelName: "auth_users",
  deleteUser: {
    // TODO: implement delete user
  },
} satisfies BetterAuthOptions["user"];

const plugins = [
  ...(process.env.NODE_ENV !== "production" ? [openAPI()] : []),
  organization({
    schema: {
      invitation: {
        modelName: "auth_invitations",
      },
      organization: {
        modelName: "auth_organizations",
      },
      member: {
        modelName: "auth_organization_members",
      },
      organizationRole: {
        modelName: "auth_organization_roles",
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
  secret: env.AUTH_SECRET,
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
  trustedOrigins: ["https://localhost:3000", "https://kayle.id"],
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
  /*...(process.env.NODE_ENV === "production"
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
    : {}),*/
  plugins: [
    ...plugins,
    customSession(
      // biome-ignore lint/nursery/noShadow: this is fine
      async ({ user, session }) => {
        // Extend the session with more fields
        let activeOrganization: Organization | null = null;

        const organizations: Organization[] = await db
          .select({
            id: auth_organizations.id,
            name: auth_organizations.name,
            slug: auth_organizations.slug,
            logo: auth_organizations.logo,
          })
          .from(auth_organizations)
          .innerJoin(
            auth_organization_members,
            eq(auth_organizations.id, auth_organization_members.organizationId)
          )
          .where(eq(auth_organization_members.userId, user.id));

        if (session.activeOrganizationId) {
          const foundOrg =
            organizations.find((o) => o.id === session.activeOrganizationId) ??
            organizations[0] ??
            null;
          activeOrganization = foundOrg ? { ...foundOrg } : null;
        }

        return {
          user: {
            ...user,
          },
          organizations,
          session: {
            ...session,
          },
          activeOrganization,
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
