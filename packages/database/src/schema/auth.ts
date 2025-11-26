import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const auth_users = pgTable("auth_users", {
  id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const auth_sessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => auth_users.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("auth_sessions_userId_idx").on(table.userId)]
);

export const auth_accounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => auth_users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("auth_accounts_userId_idx").on(table.userId)]
);

export const auth_verifications = pgTable(
  "auth_verifications",
  {
    id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)]
);

export const auth_organizations = pgTable("auth_organizations", {
  id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: text("metadata"),
});

export const auth_organization_members = pgTable(
  "auth_organization_members",
  {
    id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => auth_organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => auth_users.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("auth_organization_members_organizationId_idx").on(
      table.organizationId
    ),
    index("auth_organization_members_userId_idx").on(table.userId),
  ]
);

export const auth_invitations = pgTable(
  "auth_invitations",
  {
    id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => auth_organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => auth_users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("auth_invitations_organizationId_idx").on(table.organizationId),
    index("auth_invitations_email_idx").on(table.email),
  ]
);

export const auth_usersRelations = relations(auth_users, ({ many }) => ({
  auth_sessionss: many(auth_sessions),
  auth_accountss: many(auth_accounts),
  auth_organization_memberss: many(auth_organization_members),
  auth_invitationss: many(auth_invitations),
}));

export const auth_sessionsRelations = relations(auth_sessions, ({ one }) => ({
  auth_users: one(auth_users, {
    fields: [auth_sessions.userId],
    references: [auth_users.id],
  }),
}));

export const auth_accountsRelations = relations(auth_accounts, ({ one }) => ({
  auth_users: one(auth_users, {
    fields: [auth_accounts.userId],
    references: [auth_users.id],
  }),
}));

export const auth_organizationsRelations = relations(
  auth_organizations,
  ({ many }) => ({
    auth_organization_memberss: many(auth_organization_members),
    auth_invitationss: many(auth_invitations),
  })
);

export const auth_organization_membersRelations = relations(
  auth_organization_members,
  ({ one }) => ({
    auth_organizations: one(auth_organizations, {
      fields: [auth_organization_members.organizationId],
      references: [auth_organizations.id],
    }),
    auth_users: one(auth_users, {
      fields: [auth_organization_members.userId],
      references: [auth_users.id],
    }),
  })
);

export const auth_invitationsRelations = relations(
  auth_invitations,
  ({ one }) => ({
    auth_organizations: one(auth_organizations, {
      fields: [auth_invitations.organizationId],
      references: [auth_organizations.id],
    }),
    auth_users: one(auth_users, {
      fields: [auth_invitations.inviterId],
      references: [auth_users.id],
    }),
  })
);
