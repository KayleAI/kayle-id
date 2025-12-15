export type VerificationSession = {
  id: string;
  environment: "live" | "test";
  organizationId: string;
  status: "created" | "in_progress" | "completed" | "expired" | "cancelled";
  redirectUrl: string | null;
  expiresAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
