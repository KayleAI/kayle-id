import {
  ClientMessage as CapnpClientMessage,
  ServerMessage as CapnpServerMessage,
} from "@kayle-id/capnp";
import { Message } from "capnp-es";

type ClientHello = {
  attemptId?: string;
  mobileWriteToken?: string;
  deviceId?: string;
  appVersion?: string;
};

type PhaseUpdate = {
  phase?: string;
  error?: string;
};

type DataPayload = {
  kind?: number;
  raw?: Uint8Array;
  index?: number;
  total?: number;
  chunkIndex?: number;
  chunkTotal?: number;
};

export type ClientMessage = {
  hello?: ClientHello;
  phase?: PhaseUpdate;
  data?: DataPayload;
};

export function encodeServerAck(message: string): Uint8Array {
  const msg = new Message();
  const root = msg.initRoot(CapnpServerMessage);
  const ack = root._initAck();
  ack.message = message;
  return new Uint8Array(msg.toArrayBuffer());
}

export function encodeServerError(code: string, message: string): Uint8Array {
  const msg = new Message();
  const root = msg.initRoot(CapnpServerMessage);
  const err = root._initError();
  err.code = code;
  err.message = message;
  return new Uint8Array(msg.toArrayBuffer());
}

export function decodeClientMessage(bytes: Uint8Array): ClientMessage | null {
  try {
    const message = new Message(bytes, false);
    const root = message.getRoot(CapnpClientMessage);
    switch (root.which()) {
      case CapnpClientMessage.HELLO: {
        const hello = root.hello;
        return {
          hello: {
            attemptId: hello.attemptId,
            mobileWriteToken: hello.mobileWriteToken,
            deviceId: hello.deviceId,
            appVersion: hello.appVersion,
          },
        };
      }
      case CapnpClientMessage.PHASE: {
        const phase = root.phase;
        return {
          phase: {
            phase: phase.phase,
            error: phase.error,
          },
        };
      }
      case CapnpClientMessage.DATA: {
        const data = root.data;
        return {
          data: {
            kind: data.kind,
            raw: new Uint8Array(data.raw),
            index: data.index,
            total: data.total,
            chunkIndex: data.chunkIndex,
            chunkTotal: data.chunkTotal,
          },
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
