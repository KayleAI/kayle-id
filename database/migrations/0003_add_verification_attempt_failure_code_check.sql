DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'verif_attempts_failure_code_check'
	) THEN
		ALTER TABLE "verification_attempts"
		ADD CONSTRAINT "verif_attempts_failure_code_check"
		CHECK (
			"failure_code" IS NULL
			OR "failure_code" IN (
				'session_expired',
				'session_cancelled',
				'passport_authenticity_failed',
				'selfie_face_mismatch'
			)
		);
	END IF;
END $$;
