import { env } from "@kayle-id/config/env";
import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import { db } from "@kayle-id/database/drizzle";
import {
  verification_attempts,
  verification_sessions,
} from "@kayle-id/database/schema/core";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { createHMAC } from "@/functions/hmac";
import { sessionIdSchema } from "@/shared/validation";
import { generateId, generateRandomString } from "@/utils/generate-id";
import {
  decodeClientMessage,
  encodeServerAck,
  encodeServerError,
} from "./proto";
import { webSocketErrorResponse } from "./utils";

const verify = new Hono<{ Bindings: CloudflareBindings }>();
const HANDOFF_TOKEN_TTL_MS = 5 * 60_000;
const HANDOFF_IDEMPOTENCY_WINDOW_MS = 60_000;
const HANDOFF_PAYLOAD_VERSION = 1;

const handoffParamSchema = z.object({ id: sessionIdSchema });

function isTerminalSessionStatus(status: string): boolean {
  return ["expired", "cancelled", "completed"].includes(status);
}

function isTerminalAttemptStatus(status: string): boolean {
  return ["succeeded", "failed", "cancelled"].includes(status);
}

function resolveErrorMessage(code: keyof typeof ERROR_MESSAGES): string {
  return ERROR_MESSAGES[code]?.description ?? code;
}

function jsonErrorResponse({
  code,
  status,
}: {
  code: keyof typeof ERROR_MESSAGES;
  status: 400 | 404 | 409 | 410;
}) {
  return {
    data: null,
    error: {
      code,
      message: ERROR_MESSAGES[code].description,
    },
    status,
  } as const;
}

function deriveMobileWriteToken({
  sessionId,
  attemptId,
  issuedAt,
  seed,
}: {
  sessionId: string;
  attemptId: string;
  issuedAt: Date;
  seed: string;
}) {
  return createHMAC(
    `verify_handoff_token_v1|${sessionId}|${attemptId}|${issuedAt.toISOString()}|${seed}`,
    {
      secret: env.AUTH_SECRET,
    }
  );
}

function hashMobileWriteToken(token: string) {
  return createHMAC(token, {
    secret: env.AUTH_SECRET,
  });
}

function hashMobileDeviceId(deviceId: string) {
  return createHMAC(deviceId, {
    secret: env.AUTH_SECRET,
  });
}

function generateMobileWriteTokenSeed(): string {
  return generateRandomString(64);
}

verify.post(
  "/session/:id/handoff",
  validator("param", (value, c) => {
    const parsed = handoffParamSchema.safeParse(value);

    if (!parsed.success) {
      const response = jsonErrorResponse({
        code: "INVALID_SESSION_ID",
        status: 400,
      });

      return c.json(
        {
          data: response.data,
          error: response.error,
        },
        response.status
      );
    }

    return parsed.data;
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const now = new Date();

    const [session] = await db
      .select({
        id: verification_sessions.id,
        environment: verification_sessions.environment,
        status: verification_sessions.status,
        expiresAt: verification_sessions.expiresAt,
      })
      .from(verification_sessions)
      .where(eq(verification_sessions.id, id))
      .limit(1);

    if (!session) {
      const response = jsonErrorResponse({
        code: "SESSION_NOT_FOUND",
        status: 404,
      });

      return c.json(
        {
          data: response.data,
          error: response.error,
        },
        response.status
      );
    }

    if (
      isTerminalSessionStatus(session.status) ||
      session.expiresAt.getTime() < now.getTime()
    ) {
      const response = jsonErrorResponse({
        code: "SESSION_EXPIRED",
        status: 410,
      });

      return c.json(
        {
          data: response.data,
          error: response.error,
        },
        response.status
      );
    }

    if (session.status === "in_progress") {
      const response = jsonErrorResponse({
        code: "SESSION_IN_PROGRESS",
        status: 409,
      });

      return c.json(
        {
          data: response.data,
          error: response.error,
        },
        response.status
      );
    }

    const [latestAttempt] = await db
      .select({
        id: verification_attempts.id,
        status: verification_attempts.status,
        mobileWriteTokenSeed: verification_attempts.mobileWriteTokenSeed,
        mobileWriteTokenHash: verification_attempts.mobileWriteTokenHash,
        mobileWriteTokenIssuedAt:
          verification_attempts.mobileWriteTokenIssuedAt,
        mobileWriteTokenExpiresAt:
          verification_attempts.mobileWriteTokenExpiresAt,
        mobileWriteTokenConsumedAt:
          verification_attempts.mobileWriteTokenConsumedAt,
      })
      .from(verification_attempts)
      .where(eq(verification_attempts.verificationSessionId, id))
      .orderBy(desc(verification_attempts.createdAt))
      .limit(1);

    const reuseWindowCutoff = now.getTime() - HANDOFF_IDEMPOTENCY_WINDOW_MS;
    const canReuseAttempt = Boolean(
      latestAttempt &&
        latestAttempt.status === "in_progress" &&
        latestAttempt.mobileWriteTokenSeed &&
        latestAttempt.mobileWriteTokenHash &&
        latestAttempt.mobileWriteTokenIssuedAt &&
        latestAttempt.mobileWriteTokenExpiresAt &&
        !latestAttempt.mobileWriteTokenConsumedAt &&
        latestAttempt.mobileWriteTokenIssuedAt.getTime() >= reuseWindowCutoff &&
        latestAttempt.mobileWriteTokenExpiresAt.getTime() > now.getTime()
    );

    let attemptId: string;
    let issuedAt: Date;
    let expiresAt: Date;
    let mobileWriteTokenSeed: string;

    if (canReuseAttempt && latestAttempt) {
      attemptId = latestAttempt.id;
      issuedAt = latestAttempt.mobileWriteTokenIssuedAt as Date;
      expiresAt = latestAttempt.mobileWriteTokenExpiresAt as Date;
      mobileWriteTokenSeed = latestAttempt.mobileWriteTokenSeed as string;
    } else {
      attemptId = generateId({
        type: "va",
        environment: session.environment,
      });
      issuedAt = now;
      expiresAt = new Date(now.getTime() + HANDOFF_TOKEN_TTL_MS);
      mobileWriteTokenSeed = generateMobileWriteTokenSeed();
      const token = await deriveMobileWriteToken({
        sessionId: session.id,
        attemptId,
        issuedAt,
        seed: mobileWriteTokenSeed,
      });
      const tokenHash = await hashMobileWriteToken(token);

      await db.insert(verification_attempts).values({
        id: attemptId,
        verificationSessionId: session.id,
        status: "in_progress",
        mobileWriteTokenSeed,
        mobileWriteTokenHash: tokenHash,
        mobileWriteTokenIssuedAt: issuedAt,
        mobileWriteTokenExpiresAt: expiresAt,
        mobileWriteTokenConsumedAt: null,
      });
    }

    const mobileWriteToken = await deriveMobileWriteToken({
      sessionId: session.id,
      attemptId,
      issuedAt,
      seed: mobileWriteTokenSeed,
    });

    return c.json(
      {
        data: {
          v: HANDOFF_PAYLOAD_VERSION,
          session_id: session.id,
          attempt_id: attemptId,
          mobile_write_token: mobileWriteToken,
          expires_at: expiresAt.toISOString(),
        },
        error: null,
      },
      200
    );
  }
);

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

    const sendAuthErrorAndClose = (code: keyof typeof ERROR_MESSAGES) => {
      const message = resolveErrorMessage(code);
      sendError(code, message);
      server.close(1008, code);
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

    const parseHelloPayload = (payload: {
      attemptId?: string;
      mobileWriteToken?: string;
      deviceId?: string;
      appVersion?: string;
    }) => {
      const parsed = {
        attemptId: payload.attemptId?.trim() ?? "",
        mobileWriteToken: payload.mobileWriteToken?.trim() ?? "",
        deviceId: payload.deviceId?.trim() ?? "",
        appVersion: payload.appVersion?.trim() ?? "",
      };

      if (!(parsed.attemptId && parsed.mobileWriteToken && parsed.deviceId)) {
        return null;
      }

      return parsed;
    };

    const getAttemptForHello = async (attemptId: string) => {
      const [attempt] = await db
        .select({
          id: verification_attempts.id,
          status: verification_attempts.status,
          mobileWriteTokenHash: verification_attempts.mobileWriteTokenHash,
          mobileWriteTokenExpiresAt:
            verification_attempts.mobileWriteTokenExpiresAt,
          mobileWriteTokenConsumedAt:
            verification_attempts.mobileWriteTokenConsumedAt,
          mobileHelloDeviceIdHash:
            verification_attempts.mobileHelloDeviceIdHash,
        })
        .from(verification_attempts)
        .where(
          and(
            eq(verification_attempts.id, attemptId),
            eq(verification_attempts.verificationSessionId, session.id)
          )
        )
        .limit(1);

      return attempt ?? null;
    };

    const resolveHelloAuthState = async ({
      attempt,
      mobileWriteToken,
      deviceId,
    }: {
      attempt: NonNullable<Awaited<ReturnType<typeof getAttemptForHello>>>;
      mobileWriteToken: string;
      deviceId: string;
    }) => {
      if (!attempt.mobileWriteTokenHash) {
        return {
          kind: "error" as const,
          code: "HANDOFF_TOKEN_INVALID" as const,
        };
      }

      const providedTokenHash = await hashMobileWriteToken(mobileWriteToken);
      if (providedTokenHash !== attempt.mobileWriteTokenHash) {
        return {
          kind: "error" as const,
          code: "HANDOFF_TOKEN_INVALID" as const,
        };
      }

      const deviceIdHash = await hashMobileDeviceId(deviceId);

      if (attempt.mobileWriteTokenConsumedAt) {
        if (!attempt.mobileHelloDeviceIdHash) {
          return {
            kind: "error" as const,
            code: "HANDOFF_TOKEN_CONSUMED" as const,
          };
        }

        if (attempt.mobileHelloDeviceIdHash !== deviceIdHash) {
          return {
            kind: "error" as const,
            code: "HANDOFF_DEVICE_MISMATCH" as const,
          };
        }

        return { kind: "resume" as const };
      }

      const expiresAtMs = attempt.mobileWriteTokenExpiresAt?.getTime() ?? 0;
      if (expiresAtMs <= Date.now()) {
        return {
          kind: "error" as const,
          code: "HANDOFF_TOKEN_EXPIRED" as const,
        };
      }

      return {
        kind: "consume" as const,
        deviceIdHash,
      };
    };

    const consumeHelloAttempt = async ({
      attemptId,
      deviceIdHash,
      appVersion,
    }: {
      attemptId: string;
      deviceIdHash: string;
      appVersion: string;
    }) => {
      await db
        .update(verification_attempts)
        .set({
          mobileWriteTokenConsumedAt: new Date(),
          mobileHelloDeviceIdHash: deviceIdHash,
          mobileHelloAppVersion: appVersion || null,
        })
        .where(eq(verification_attempts.id, attemptId));
    };

    const markSessionInProgress = async () => {
      if (session.status === "in_progress") {
        return;
      }

      await db
        .update(verification_sessions)
        .set({
          status: "in_progress",
        })
        .where(eq(verification_sessions.id, session.id));

      session.status = "in_progress";
    };

    const acknowledgeHello = () => {
      state.helloReceived = true;
      sendAck("hello_ok");
    };

    const handleHello = async (payload: {
      attemptId?: string;
      mobileWriteToken?: string;
      deviceId?: string;
      appVersion?: string;
    }) => {
      const parsed = parseHelloPayload(payload);

      logDebug("recv_hello", {
        attemptIdPresent: Boolean(parsed?.attemptId),
        mobileWriteTokenPresent: Boolean(parsed?.mobileWriteToken),
        deviceIdPresent: Boolean(parsed?.deviceId),
      });

      if (!parsed) {
        sendAuthErrorAndClose("HELLO_AUTH_REQUIRED");
        return;
      }

      const attempt = await getAttemptForHello(parsed.attemptId);
      if (!attempt || isTerminalAttemptStatus(attempt.status)) {
        sendAuthErrorAndClose("ATTEMPT_NOT_FOUND");
        return;
      }

      const authState = await resolveHelloAuthState({
        attempt,
        mobileWriteToken: parsed.mobileWriteToken,
        deviceId: parsed.deviceId,
      });

      if (authState.kind === "error") {
        sendAuthErrorAndClose(authState.code);
        return;
      }

      if (authState.kind === "resume") {
        acknowledgeHello();
        return;
      }

      await consumeHelloAttempt({
        attemptId: attempt.id,
        deviceIdHash: authState.deviceIdHash,
        appVersion: parsed.appVersion,
      });
      await markSessionInProgress();

      acknowledgeHello();
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
        await handleHello(decoded.hello);
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
