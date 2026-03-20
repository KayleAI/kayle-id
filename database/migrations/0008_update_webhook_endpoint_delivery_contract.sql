ALTER TABLE "webhook_deliveries" ALTER COLUMN "webhook_encryption_key_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "payload" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "subscribed_event_types" jsonb DEFAULT '["verification.attempt.succeeded"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "signing_secret_ciphertext" text;
