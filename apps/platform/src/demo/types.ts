import type { SupportedWebhookEventType } from "@kayle-id/config/webhook-events";

export type DemoFieldMode = "off" | "optional" | "required";

export type DemoRequestedShareField = {
  reason: string;
  required: boolean;
};

export type DemoRequestedShareFields = Record<string, DemoRequestedShareField>;

export type DemoSessionShareField = {
  reason: string;
  required: boolean;
  source: "default" | "rc";
};

export type DemoSessionShareFields = Record<string, DemoSessionShareField>;

export type DemoSessionStatus = {
  completed_at: string | null;
  is_terminal: boolean;
  latest_attempt: {
    completed_at: string | null;
    failure_code: string | null;
    id: string;
    status: "cancelled" | "failed" | "in_progress" | "succeeded";
  } | null;
  redirect_url: string | null;
  session_id: string;
  status: "cancelled" | "completed" | "created" | "expired" | "in_progress";
};

export type DemoWebhookEnvelope = {
  body: string;
  delivery_id: string | null;
  event_type: SupportedWebhookEventType | null;
  received_at: string;
  signature_header: string | null;
};

export type DemoRunRecord = {
  created_at: string;
  endpoint_id: string;
  key_id: string;
  last_session_status: DemoSessionStatus | null;
  org_slug: string;
  receiver_token: string;
  session_id: string | null;
  share_fields: DemoSessionShareFields | null;
  verification_url: string | null;
  webhook: DemoWebhookEnvelope | null;
};

export type DemoRunView = {
  endpoint_id: string;
  id: string;
  key_id: string;
  org_slug: string;
  session_id: string | null;
  session_status: DemoSessionStatus | null;
  share_fields: DemoSessionShareFields | null;
  verification_url: string | null;
  webhook: DemoWebhookEnvelope | null;
};

export type DemoRunCreateResult = {
  demo_run_id: string;
  endpoint_id: string;
  org_slug: string;
  signing_secret: string;
};

export type DemoRunSessionResult = {
  session_id: string;
  share_fields: DemoSessionShareFields;
  verification_url: string;
};
