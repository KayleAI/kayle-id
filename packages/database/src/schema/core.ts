import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { auth_organizations } from "./auth";

export const verificationSessionStatuses = [
  "created",
  "in_progress",
  "completed",
  "expired",
  "cancelled",
] as const;

export const verificationAttemptStatuses = [
  "in_progress",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export const verificationAttemptFailureCodes = [
  "session_expired",
  "session_cancelled",
  "passport_authenticity_failed",
  "selfie_face_mismatch",
] as const;

export const api_keys = pgTable(
  "api_keys",
  {
    id: uuid("id").default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => auth_organizations.id, { onDelete: "cascade" }),
    environment: text({ enum: ["live", "test"] })
      .default("live")
      .notNull(),
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
    index("api_keys_org_id_idx").on(table.organizationId),
    index("api_keys_org_enabled_idx").on(table.organizationId, table.enabled),
  ]
);

/**
 * Verification sessions are the sessions used by users to verify their identity.
 *
 * Users are anonymous in these sessions and we make no attempt to track them.
 *
 * @see https://docs.kayle.id/verification-sessions
 */
export const verification_sessions = pgTable(
  "verification_sessions",
  {
    /**
     * The ID of the verification session.
     *
     * Always prefixed with `vs_{live|test}_...`
     */
    id: text("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => auth_organizations.id, { onDelete: "cascade" }),
    environment: text({ enum: ["live", "test"] })
      .default("live")
      .notNull(),
    status: text({
      enum: verificationSessionStatuses,
    })
      .default("created")
      .notNull(),
    contractVersion: integer("contract_version").default(1).notNull(),
    shareFields: jsonb("share_fields").default({}).notNull(),
    redirectUrl: text("redirect_url"),
    /**
     * The expiration time of the verification session.
     *
     * @default 60 minutes after creation
     */
    expiresAt: timestamp("expires_at")
      .default(sql`now() + interval '60 minutes'`)
      .notNull(),
    /**
     * The time the verification session reached a terminal state (i.e., completed, expired or cancelled).
     */
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // List sessions for an org/env
    index("verif_sessions_org_env_idx").on(
      table.organizationId,
      table.environment
    ),
    // Expiry-based GC
    index("verif_sessions_expires_at_idx").on(table.expiresAt),
    index("verif_sessions_status_idx").on(table.status),
  ]
);

export const verification_attempts = pgTable(
  "verification_attempts",
  {
    /**
     * The ID of the verification attempt.
     *
     * Always prefixed with `va_{live|test}_...`
     */
    id: text("id").primaryKey(),
    /**
     * The reference to the verification session that this attempt belongs to.
     */
    verificationSessionId: text("verification_session_id")
      .notNull()
      .references(() => verification_sessions.id, { onDelete: "cascade" }),
    /**
     * The status of the verification attempt.
     *
     * If the referenced session expires, this attempt will be marked as `failed`
     * and `failure_code` will be set to `session_expired`.
     */
    status: text({
      enum: verificationAttemptStatuses,
    })
      .default("in_progress")
      .notNull(),
    /**
     * The code of the failure reason.
     *
     * This is only set if the attempt is marked as `failed`.
     */
    failureCode: text("failure_code", {
      enum: verificationAttemptFailureCodes,
    }),
    /**
     * Random seed used to derive a deterministic mobile write token for the current handoff credential.
     *
     * The seed itself is not accepted for authentication.
     */
    mobileWriteTokenSeed: text("mobile_write_token_seed"),
    /**
     * Hash of the mobile write token issued for this attempt handoff.
     *
     * Plaintext tokens are never persisted.
     */
    mobileWriteTokenHash: text("mobile_write_token_hash"),
    /**
     * Time when the current mobile write token was issued.
     */
    mobileWriteTokenIssuedAt: timestamp("mobile_write_token_issued_at"),
    /**
     * Time when the current mobile write token expires.
     */
    mobileWriteTokenExpiresAt: timestamp("mobile_write_token_expires_at"),
    /**
     * Time when the mobile write token was consumed by a successful mobile hello.
     *
     * Reserved for Phase 3 auth enforcement.
     */
    mobileWriteTokenConsumedAt: timestamp("mobile_write_token_consumed_at"),
    /**
     * Hash of the device identifier that first successfully authenticated hello for this attempt.
     */
    mobileHelloDeviceIdHash: text("mobile_hello_device_id_hash"),
    /**
     * App version reported by the device that authenticated hello for this attempt.
     */
    mobileHelloAppVersion: text("mobile_hello_app_version"),
    /**
     * Degree of risk associated with the verification attempt.
     *
     * Stored as a decimal number between 0 and 1.
     *
     * @default 0
     */
    riskScore: real("risk_score").default(0).notNull(),
    /**
     * The time the verification attempt reached a terminal state (i.e., succeeded, failed or cancelled).
     */
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Attempts by session
    index("verif_attempts_session_id_idx").on(table.verificationSessionId),
    // Filter by status (e.g. in_progress, failed)
    index("verif_attempts_status_idx").on(table.status),
  ]
);

/**
 * Logical events generated by Kayle ID.
 *
 * These are domain-agnostic records of “something happened”
 * (e.g., a verification attempt succeeded).
 *
 * They do NOT contain any plaintext PII.
 */
export const events = pgTable(
  "events",
  {
    /**
     * The ID of the event.
     *
     * Always prefixed with `evt_{live|test}_...`
     */
    id: text("id").primaryKey(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => auth_organizations.id, { onDelete: "cascade" }),

    environment: text({ enum: ["live", "test"] })
      .default("live")
      .notNull(),

    /**
     * The type of the event.
     *
     * Examples:
     * - verification.attempt.succeeded
     * - verification.attempt.failed
     * - verification.session.expired
     */
    type: text("type").notNull(),

    /**
     * The ID of the object that triggered this event.
     *
     * This is a generic reference and is not a foreign key.
     * For example:
     * - a verification session ID (`vs_live_...`)
     * - a verification attempt ID (`va_live_...`)
     */
    triggerId: text("trigger_id").notNull(),

    /**
     * The type of the object that triggered this event.
     *
     * For example:
     * - verification_session
     * - verification_attempt
     */
    triggerType: text("trigger_type").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Events per org/env ordered by time
    index("events_org_env_created_idx").on(
      table.organizationId,
      table.environment,
      table.createdAt
    ),
    // Filter by type
    index("events_type_idx").on(table.type),
  ]
);
