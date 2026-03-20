import type {
  VerifyServerVerdict,
  VerifyShareRequest,
} from "@kayle-id/capnp/verify-codec";
import type { ApiRequestLogger } from "@/logging";
import { createTransferState, type VerifyTransferState } from "./data-payload";
import type { ActiveVerifySession } from "./session-context";
import type { VerifyShareManifest } from "./share-manifest";

export type VerifySocketState = {
  acceptedFaceScore: number | null;
  attemptId: string | null;
  currentPhase: string | null;
  helloReceived: boolean;
  shareManifest: VerifyShareManifest | null;
  shareRequestSent: boolean;
  transfer: VerifyTransferState;
};

export type VerifySocketTransport = {
  closeAfterVerdict: (code: string) => void;
  closeSocket: (code: number, reason: string) => void;
  logDebug: (label: string, details?: Record<string, unknown>) => void;
  sendAck: (message: string) => void;
  sendAuthErrorAndClose: (
    code:
      | "ATTEMPT_CONNECTION_ACTIVE"
      | "ATTEMPT_NOT_FOUND"
      | "HANDOFF_DEVICE_MISMATCH"
      | "HANDOFF_TOKEN_CONSUMED"
      | "HANDOFF_TOKEN_EXPIRED"
      | "HANDOFF_TOKEN_INVALID"
      | "HELLO_AUTH_REQUIRED"
  ) => void;
  sendError: (code: string, message: string) => void;
  sendShareReady: (input: {
    selectedFieldKeys: string[];
    sessionId: string;
  }) => void;
  sendShareRequest: (shareRequest: VerifyShareRequest) => void;
  sendVerdict: (verdict: VerifyServerVerdict) => void;
};

export type VerifySocketContext = {
  connectionOwnerId: string;
  env: CloudflareBindings;
  log: ApiRequestLogger;
  scheduleTask: (task: Promise<unknown>) => void;
  session: ActiveVerifySession;
  shareRequestPayload: VerifyShareRequest;
  state: VerifySocketState;
  transport: VerifySocketTransport;
};

export function createVerifySocketState(): VerifySocketState {
  return {
    acceptedFaceScore: null,
    attemptId: null,
    currentPhase: null,
    helloReceived: false,
    shareManifest: null,
    shareRequestSent: false,
    transfer: createTransferState(),
  };
}
