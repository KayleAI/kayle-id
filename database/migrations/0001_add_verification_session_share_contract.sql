ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_sessions" ADD COLUMN IF NOT EXISTS "contract_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_sessions" ADD COLUMN IF NOT EXISTS "share_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;
