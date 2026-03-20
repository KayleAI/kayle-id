ALTER TABLE "verification_attempts" ADD COLUMN "mobile_write_token_hash" text;--> statement-breakpoint
ALTER TABLE "verification_attempts" ADD COLUMN "mobile_write_token_issued_at" timestamp;--> statement-breakpoint
ALTER TABLE "verification_attempts" ADD COLUMN "mobile_write_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "verification_attempts" ADD COLUMN "mobile_write_token_consumed_at" timestamp;