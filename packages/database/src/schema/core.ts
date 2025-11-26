import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { auth_organizations } from "./auth";

export const core_api_keys = pgTable(
  "core_api_keys",
  {
    id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => auth_organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    permissions: jsonb("permissions").default({}).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
  },
  (table) => [
    index("core_api_keys_org_id_idx").on(table.organizationId),
    index("core_api_keys_org_enabled_idx").on(
      table.organizationId,
      table.enabled
    ),
  ]
);
