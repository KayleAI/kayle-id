ALTER TABLE "verification_attempts" ADD COLUMN "current_phase" text;--> statement-breakpoint
ALTER TABLE "verification_attempts" ADD COLUMN "phase_updated_at" timestamp;
