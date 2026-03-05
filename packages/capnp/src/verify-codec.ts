import { Message } from "capnp-es";
import {
  ClientMessage as CapnpClientMessage,
  DataKind as CapnpDataKind,
  ServerMessage as CapnpServerMessage,
} from "../generated/ts/verify.js";

export type VerifyClientHello = {
  attemptId?: string;
  mobileWriteToken?: string;
  deviceId?: string;
  appVersion?: string;
};

export type VerifyPhaseUpdate = {
  phase?: string;
  error?: string;
};

export type VerifyDataPayload = {
  kind?: number;
  raw?: Uint8Array;
  index?: number;
  total?: number;
  chunkIndex?: number;
  chunkTotal?: number;
};

export type VerifyClientMessage = {
  hello?: VerifyClientHello;
  phase?: VerifyPhaseUpdate;
  data?: VerifyDataPayload;
};

export type VerifyServerMessage = {
  ack?: {
    message: string;
  };
  error?: {
    code: string;
    message: string;
  };
};

function toCapnpDataKind(
  kind: number | undefined
): (typeof CapnpDataKind)[keyof typeof CapnpDataKind] {
  switch (kind) {
    case CapnpDataKind.DG2:
      return CapnpDataKind.DG2;
    case CapnpDataKind.SOD:
      return CapnpDataKind.SOD;
    case CapnpDataKind.SELFIE:
      return CapnpDataKind.SELFIE;
    default:
      return CapnpDataKind.DG1;
  }
}

export function encodeServerAck(message: string): Uint8Array {
  const packet = new Message();
  const root = packet.initRoot(CapnpServerMessage);
  const ack = root._initAck();
  ack.message = message;
  return new Uint8Array(packet.toArrayBuffer());
}

export function encodeServerError(code: string, message: string): Uint8Array {
  const packet = new Message();
  const root = packet.initRoot(CapnpServerMessage);
  const error = root._initError();
  error.code = code;
  error.message = message;
  return new Uint8Array(packet.toArrayBuffer());
}

export function decodeServerMessage(
  bytes: Uint8Array
): VerifyServerMessage | null {
  try {
    const packet = new Message(bytes, false);
    const root = packet.getRoot(CapnpServerMessage);

    switch (root.which()) {
      case CapnpServerMessage.ACK:
        return {
          ack: {
            message: root.ack.message,
          },
        };
      case CapnpServerMessage.ERROR:
        return {
          error: {
            code: root.error.code,
            message: root.error.message,
          },
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function encodeClientHello(hello: VerifyClientHello): Uint8Array {
  const packet = new Message();
  const root = packet.initRoot(CapnpClientMessage);
  const next = root._initHello();
  next.attemptId = hello.attemptId ?? "";
  next.mobileWriteToken = hello.mobileWriteToken ?? "";
  next.deviceId = hello.deviceId ?? "";
  next.appVersion = hello.appVersion ?? "";
  return new Uint8Array(packet.toArrayBuffer());
}

export function encodeClientPhase(phase: VerifyPhaseUpdate): Uint8Array {
  const packet = new Message();
  const root = packet.initRoot(CapnpClientMessage);
  const next = root._initPhase();
  next.phase = phase.phase ?? "";
  next.error = phase.error ?? "";
  return new Uint8Array(packet.toArrayBuffer());
}

export function encodeClientData(data: VerifyDataPayload): Uint8Array {
  const packet = new Message();
  const root = packet.initRoot(CapnpClientMessage);
  const next = root._initData();
  next.kind = toCapnpDataKind(data.kind);
  const raw = data.raw ?? new Uint8Array();
  next._initRaw(raw.length).copyBuffer(raw);
  next.index = data.index ?? 0;
  next.total = data.total ?? 0;
  next.chunkIndex = data.chunkIndex ?? 0;
  next.chunkTotal = data.chunkTotal ?? 0;
  return new Uint8Array(packet.toArrayBuffer());
}

export function decodeClientMessage(
  bytes: Uint8Array
): VerifyClientMessage | null {
  try {
    const packet = new Message(bytes, false);
    const root = packet.getRoot(CapnpClientMessage);

    switch (root.which()) {
      case CapnpClientMessage.HELLO:
        return {
          hello: {
            attemptId: root.hello.attemptId,
            mobileWriteToken: root.hello.mobileWriteToken,
            deviceId: root.hello.deviceId,
            appVersion: root.hello.appVersion,
          },
        };
      case CapnpClientMessage.PHASE:
        return {
          phase: {
            phase: root.phase.phase,
            error: root.phase.error,
          },
        };
      case CapnpClientMessage.DATA:
        return {
          data: {
            kind: root.data.kind,
            raw: new Uint8Array(root.data.raw.toUint8Array()),
            index: root.data.index,
            total: root.data.total,
            chunkIndex: root.data.chunkIndex,
            chunkTotal: root.data.chunkTotal,
          },
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
