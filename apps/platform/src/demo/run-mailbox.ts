import { DurableObject } from "cloudflare:workers";
import { disableDemoWebhookEndpoint } from "./api";
import type {
  DemoRunRecord,
  DemoSessionShareFields,
  DemoSessionStatus,
  DemoWebhookEnvelope,
} from "./types";

const ABANDONED_RUN_RETENTION_MS = 2 * 60 * 60 * 1000;
const TERMINAL_RUN_RETENTION_MS = 30 * 60 * 1000;
const RECORD_KEY = "demo-run";

type DemoRunMailboxEnv = {
  API?: Fetcher;
  KAYLE_DEMO_API_KEY?: string;
  KAYLE_DEMO_ORG_SLUG?: string;
};

type InitializePayload = {
  endpoint_id: string;
  key_id: string;
  org_slug: string;
  receiver_token: string;
};

type SessionPayload = {
  session_id: string;
  share_fields: DemoSessionShareFields;
  verification_url: string;
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

export class DemoRunMailbox extends DurableObject<DemoRunMailboxEnv> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "POST" && pathname === "/initialize") {
      await this.initializeRecord((await request.json()) as InitializePayload);
      return new Response(null, { status: 204 });
    }

    const record = await this.getRecord();
    if (!record) {
      return jsonResponse(
        {
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Demo run not found.",
          },
        },
        { status: 404 }
      );
    }

    if (request.method === "GET" && pathname === "/state") {
      return jsonResponse({ data: record, error: null });
    }

    if (request.method === "POST" && pathname === "/session") {
      await this.persistSession(
        record,
        (await request.json()) as SessionPayload
      );
      return new Response(null, { status: 204 });
    }

    if (request.method === "POST" && pathname === "/session-status") {
      await this.persistSessionStatus(
        record,
        (await request.json()) as DemoSessionStatus
      );
      return new Response(null, { status: 204 });
    }

    if (request.method === "POST" && pathname === "/webhook") {
      const token = url.searchParams.get("token");
      if (!token || token !== record.receiver_token) {
        return jsonResponse(
          {
            data: null,
            error: {
              code: "FORBIDDEN",
              message: "Webhook token is invalid.",
            },
          },
          { status: 403 }
        );
      }

      await this.persistWebhook(record, request);
      return new Response(null, { status: 204 });
    }

    return jsonResponse(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Demo mailbox route not found.",
        },
      },
      { status: 404 }
    );
  }

  async alarm(): Promise<void> {
    const record = await this.getRecord();
    if (!record) {
      return;
    }

    try {
      await disableDemoWebhookEndpoint({
        bindings: this.env,
        endpointId: record.endpoint_id,
      });
    } catch {
      // The demo mailbox is ephemeral; failed cleanup should not keep the state alive.
    }

    await this.ctx.storage.deleteAll();
  }

  private async getRecord(): Promise<DemoRunRecord | null> {
    return (await this.ctx.storage.get<DemoRunRecord>(RECORD_KEY)) ?? null;
  }

  private async initializeRecord(payload: InitializePayload): Promise<void> {
    const record: DemoRunRecord = {
      created_at: new Date().toISOString(),
      endpoint_id: payload.endpoint_id,
      key_id: payload.key_id,
      last_session_status: null,
      org_slug: payload.org_slug,
      receiver_token: payload.receiver_token,
      session_id: null,
      share_fields: null,
      verification_url: null,
      webhook: null,
    };

    await this.ctx.storage.put(RECORD_KEY, record);
    await this.ctx.storage.setAlarm(Date.now() + ABANDONED_RUN_RETENTION_MS);
  }

  private async persistSession(
    record: DemoRunRecord,
    payload: SessionPayload
  ): Promise<void> {
    await this.ctx.storage.put(RECORD_KEY, {
      ...record,
      session_id: payload.session_id,
      share_fields: payload.share_fields,
      verification_url: payload.verification_url,
    });
  }

  private async persistSessionStatus(
    record: DemoRunRecord,
    sessionStatus: DemoSessionStatus
  ): Promise<void> {
    await this.ctx.storage.put(RECORD_KEY, {
      ...record,
      last_session_status: sessionStatus,
    });

    if (sessionStatus.is_terminal) {
      await this.ctx.storage.setAlarm(Date.now() + TERMINAL_RUN_RETENTION_MS);
    }
  }

  private async persistWebhook(
    record: DemoRunRecord,
    request: Request
  ): Promise<void> {
    const envelope: DemoWebhookEnvelope = {
      body: await request.text(),
      delivery_id: request.headers.get("X-Kayle-Delivery-Id"),
      event_type: request.headers.get(
        "X-Kayle-Event"
      ) as DemoWebhookEnvelope["event_type"],
      received_at: new Date().toISOString(),
      signature_header: request.headers.get("X-Kayle-Signature"),
    };

    await this.ctx.storage.put(RECORD_KEY, {
      ...record,
      webhook: envelope,
    });
    await this.ctx.storage.setAlarm(Date.now() + TERMINAL_RUN_RETENTION_MS);
  }
}
