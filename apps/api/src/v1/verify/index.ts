import { db } from "@kayle-id/database/drizzle";
import { verification_sessions } from "@kayle-id/database/schema/core";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { sessionIdSchema } from "@/shared/validation";
import {
  decodeClientMessage,
  encodeServerAck,
  encodeServerError,
} from "./proto";
import { webSocketErrorResponse } from "./utils";

const verify = new Hono<{ Bindings: CloudflareBindings }>();

verify.get(
  "/session/:id",
  validator("param", (value) => {
    const parsed = z.object({ id: sessionIdSchema }).safeParse(value);

    if (!parsed.success) {
      return webSocketErrorResponse({
        code: "INVALID_SESSION_ID",
      });
    }

    return parsed.data;
  }),
  async (c) => {
    const { id } = c.req.valid("param");

    const [session] = await db
      .select({
        id: verification_sessions.id,
        organizationId: verification_sessions.organizationId,
        environment: verification_sessions.environment,
        status: verification_sessions.status,
        redirectUrl: verification_sessions.redirectUrl,
        expiresAt: verification_sessions.expiresAt,
        completedAt: verification_sessions.completedAt,
        createdAt: verification_sessions.createdAt,
        updatedAt: verification_sessions.updatedAt,
      })
      .from(verification_sessions)
      .where(eq(verification_sessions.id, id))
      .limit(1);

    if (!session) {
      return webSocketErrorResponse({
        code: "SESSION_NOT_FOUND",
      });
    }

    if (
      ["expired", "cancelled", "completed"].includes(session.status) ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return webSocketErrorResponse({
        code: "SESSION_EXPIRED",
      });
    }

    if (session.status === "in_progress") {
      // NOTE: We must only move to the in_progress state if the user for this session is actively in the process of verifying their identity.
      // If they're for example, switching devices we should not move to the in_progress state.
      return webSocketErrorResponse({
        code: "SESSION_IN_PROGRESS",
      });
    }

    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
      return c.json(
        {
          error: {
            code: "WEBSOCKET_REQUIRED",
            message: "This endpoint requires a WebSocket connection.",
          },
        },
        426
      );
    }

    // biome-ignore lint/correctness/noUndeclaredVariables: This is a Cloudflare Worker's global
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();

    const debug = c.req.query("debug") === "1";

    const state = {
      helloReceived: false,
      dg1: undefined as Uint8Array | undefined,
      dg2: undefined as Uint8Array | undefined,
      sod: undefined as Uint8Array | undefined,
      selfies: [] as Uint8Array[],
      chunks: new Map<
        string,
        {
          chunkTotal: number;
          parts: Map<number, Uint8Array>;
        }
      >(),
      selfieTotal: undefined as number | undefined,
    };

    const logDebug = (label: string, details?: Record<string, unknown>) => {
      if (!debug) {
        return;
      }
      const suffix = details ? ` ${JSON.stringify(details)}` : "";
      console.log(`[verify/ws] ${label}${suffix}`);
    };

    const sendAck = (message: string) => {
      logDebug("send_ack", { message });
      server.send(encodeServerAck(message));
    };

    const sendError = (code: string, message: string) => {
      logDebug("send_error", { code, message });
      server.send(encodeServerError(code, message));
    };

    const verifyAuthenticityStub = () => {
      // TODO: implement authenticity verification (e.g. passive auth, SOD signature, CSCA trust store).
      return { ok: true };
    };

    const getBytesFromEvent = async (
      event: MessageEvent
    ): Promise<Uint8Array | undefined> => {
      if (typeof event.data === "string") {
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        return new Uint8Array(event.data);
      }
      if (event.data instanceof Uint8Array) {
        return event.data;
      }
      if (event.data instanceof Blob) {
        return new Uint8Array(await event.data.arrayBuffer());
      }
      return;
    };

    const handleHello = () => {
      logDebug("recv_hello");
      state.helloReceived = true;
      sendAck("hello_ok");
    };

    const handlePhase = (payload: { phase?: string; error?: string }) => {
      logDebug("recv_phase", {
        phase: payload.phase ?? "",
        error: payload.error ?? "",
      });
      sendAck("phase_ok");
    };

    const getOrCreateChunkEntry = (key: string, chunkTot: number) => {
      const existing = state.chunks.get(key);
      if (existing) {
        if (existing.chunkTotal !== chunkTot) {
          existing.chunkTotal = chunkTot;
        }
        return existing;
      }
      const entry = {
        chunkTotal: chunkTot,
        parts: new Map<number, Uint8Array>(),
      };
      state.chunks.set(key, entry);
      return entry;
    };

    const mergeChunks = (parts: Uint8Array[]) => {
      const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const part of parts) {
        merged.set(part, offset);
        offset += part.length;
      }
      return merged;
    };

    const collectChunks = (entry: {
      chunkTotal: number;
      parts: Map<number, Uint8Array>;
    }) => {
      const buffers: Uint8Array[] = [];
      for (let i = 0; i < entry.chunkTotal; i += 1) {
        const part = entry.parts.get(i);
        if (!part) {
          return null;
        }
        buffers.push(part);
      }
      return buffers;
    };

    const assembleChunks = (
      key: string,
      chunkIdx: number,
      chunkTot: number,
      chunk: Uint8Array
    ): { complete: boolean; data?: Uint8Array } => {
      if (chunkTot <= 1) {
        return { complete: true, data: chunk };
      }

      const entry = getOrCreateChunkEntry(key, chunkTot);
      entry.parts.set(chunkIdx, chunk);

      if (entry.parts.size < entry.chunkTotal) {
        return { complete: false };
      }

      const buffers = collectChunks(entry);
      if (!buffers) {
        return { complete: false };
      }

      const merged = mergeChunks(buffers);
      state.chunks.delete(key);
      return { complete: true, data: merged };
    };

    const storeData = (kind: number, data: Uint8Array, total: number) => {
      switch (kind) {
        case 0:
          state.dg1 = data;
          return;
        case 1:
          state.dg2 = data;
          return;
        case 2:
          state.sod = data;
          return;
        case 3:
          state.selfies.push(data);
          if (total > 0) {
            state.selfieTotal = total;
          }
          return;
        default:
          sendError("UNKNOWN_DATA_KIND", "Unknown data kind.");
      }
    };

    const handleData = (payload: {
      kind?: number;
      raw?: Uint8Array;
      index?: number;
      total?: number;
      chunkIndex?: number;
      chunkTotal?: number;
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: I'll refactor this later
    }) => {
      const kind = payload.kind ?? 0;
      const raw = payload.raw ?? new Uint8Array();
      const index = payload.index ?? 0;
      const total = payload.total ?? 0;
      const chunkIndex = payload.chunkIndex ?? 0;
      const chunkTotal = payload.chunkTotal ?? 0;

      logDebug("recv_data", {
        kind,
        size: raw.length,
        index,
        total,
        chunkIndex,
        chunkTotal,
      });

      const chunkKey = `${kind}:${index}`;
      const assembled = assembleChunks(chunkKey, chunkIndex, chunkTotal, raw);
      if (!assembled.complete) {
        sendAck(`data_chunk_ok_${kind}_${index}_${chunkIndex}`);
        return;
      }

      const data = assembled.data ?? raw;
      storeData(kind, data, total);

      if (
        kind === 3 &&
        state.selfieTotal &&
        state.selfies.length >= state.selfieTotal
      ) {
        sendAck(`selfies_ok_${state.selfieTotal}`);
      } else {
        sendAck(`data_ok_${kind}_${index}`);
      }

      if (state.dg1 && state.dg2 && state.sod) {
        const result = verifyAuthenticityStub();
        if (!result.ok) {
          sendError("AUTH_FAILED", "Authenticity verification failed.");
        }
      }
    };

    const handleMessage = async (event: MessageEvent) => {
      const bytes = await getBytesFromEvent(event);
      if (!bytes) {
        logDebug("recv_invalid_message");
        sendError("INVALID_MESSAGE", "Binary protobuf messages are required.");
        return;
      }

      const decoded = decodeClientMessage(bytes);
      if (!decoded) {
        logDebug("recv_decode_failed", { size: bytes.length });
        sendError("DECODE_FAILED", "Failed to decode protobuf message.");
        return;
      }

      if (decoded.hello) {
        handleHello();
        return;
      }

      if (!state.helloReceived) {
        sendError("HELLO_REQUIRED", "Send hello before other messages.");
        return;
      }

      if (decoded.phase) {
        handlePhase(decoded.phase);
        return;
      }

      if (decoded.data) {
        handleData(decoded.data);
      }
    };

    server.addEventListener("message", (event) => {
      // biome-ignore lint/complexity/noVoid: it's fine for now
      void handleMessage(event);
    });

    server.addEventListener("close", () => {
      state.selfies = [];
      state.dg1 = undefined;
      state.dg2 = undefined;
      state.sod = undefined;
      state.chunks.clear();
      state.selfieTotal = undefined;
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
);

export default verify;
