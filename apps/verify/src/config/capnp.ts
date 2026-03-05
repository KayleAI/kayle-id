import { ClientMessage, ServerMessage } from "@kayle-id/capnp";
import { Message } from "capnp-es";
import { getApiWsBaseUrl } from "@/config/env";

export type SessionError = {
  code: string;
  message: string;
};

export type VerifySession = {
  connect: () => Promise<void>;
  ping: () => Promise<string>;
  notifyUnsupportedDevice: () => Promise<void>;
  sendPhase: (phase: string, error?: string) => Promise<void>;
  sendData: (
    kind: number,
    raw: Uint8Array,
    index?: number,
    total?: number
  ) => Promise<void>;
  close: () => void;
};

type PendingRequest = {
  resolve: (message: string) => void;
  reject: (error: Error) => void;
};

export type HelloCredentials = {
  attemptId: string;
  mobileWriteToken: string;
  deviceId: string;
  appVersion: string;
};

type ServerMessageReader = {
  which: () => number;
  ack: {
    message: string;
  };
  error: {
    code: string;
    message: string;
  };
};

type ClientMessageWriter = {
  _initHello: () => {
    attemptId: string;
    mobileWriteToken: string;
    deviceId: string;
    appVersion: string;
  };
  _initPhase: () => {
    phase: string;
    error: string;
  };
  _initData: () => {
    kind: number;
    raw: Uint8Array;
    index: number;
    total: number;
  };
};

// `@kayle-id/capnp` and app-local `capnp-es` can resolve to distinct type instances under Bun.
// We bridge that boundary here via runtime-compatible casts.
const CLIENT_MESSAGE_CTOR = ClientMessage as unknown as never;
const SERVER_MESSAGE_CTOR = ServerMessage as unknown as never;

const getBytesFromEvent = async (
  event: MessageEvent
): Promise<Uint8Array | null> => {
  if (typeof event.data === "string") {
    return null;
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
  return null;
};

const parseJsonError = (text: string): SessionError | null => {
  try {
    const parsed = JSON.parse(text) as {
      error?: { code?: string; message?: string };
    };
    if (!parsed.error?.code) {
      return null;
    }
    return {
      code: parsed.error.code,
      message: parsed.error.message ?? parsed.error.code,
    };
  } catch {
    return null;
  }
};

const decodeServerMessage = (
  bytes: Uint8Array
): { ack?: string; error?: SessionError } | null => {
  try {
    const message = new Message(bytes, false);
    const root = message.getRoot(
      SERVER_MESSAGE_CTOR
    ) as unknown as ServerMessageReader;
    switch (root.which()) {
      case ServerMessage.ACK: {
        return { ack: root.ack.message };
      }
      case ServerMessage.ERROR: {
        return {
          error: {
            code: root.error.code,
            message: root.error.message,
          },
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
};

const encodeHello = ({
  attemptId,
  mobileWriteToken,
  deviceId,
  appVersion,
}: HelloCredentials): Uint8Array => {
  const message = new Message();
  const root = message.initRoot(
    CLIENT_MESSAGE_CTOR
  ) as unknown as ClientMessageWriter;
  const hello = root._initHello();
  hello.attemptId = attemptId;
  hello.mobileWriteToken = mobileWriteToken;
  hello.deviceId = deviceId;
  hello.appVersion = appVersion;
  return new Uint8Array(message.toArrayBuffer());
};

const encodePhase = (phase: string, error?: string): Uint8Array => {
  const message = new Message();
  const root = message.initRoot(
    CLIENT_MESSAGE_CTOR
  ) as unknown as ClientMessageWriter;
  const update = root._initPhase();
  update.phase = phase;
  update.error = error ?? "";
  return new Uint8Array(message.toArrayBuffer());
};

const encodeData = (
  kind: number,
  raw: Uint8Array,
  index: number,
  total: number
): Uint8Array => {
  const message = new Message();
  const root = message.initRoot(
    CLIENT_MESSAGE_CTOR
  ) as unknown as ClientMessageWriter;
  const data = root._initData();
  data.kind = kind;
  data.raw = raw;
  data.index = index;
  data.total = total;
  return new Uint8Array(message.toArrayBuffer());
};

export function initialiseSession(
  {
    sessionId,
    helloCredentials,
  }: {
    sessionId: string;
    helloCredentials: HelloCredentials | null;
  },
  onError?: (error: SessionError) => void
): VerifySession {
  const url = `${getApiWsBaseUrl()}/v1/verify/session/${sessionId}`;

  let socket: WebSocket | null = null;
  let openPromise: Promise<void> | null = null;
  const pending: PendingRequest[] = [];

  const dispatchError = (error: SessionError) => {
    onError?.(error);
  };

  const handleServerAck = (ack: string) => {
    const pendingRequest = pending.shift();
    if (pendingRequest) {
      pendingRequest.resolve(ack);
    }
  };

  const handleServerError = (error: SessionError) => {
    dispatchError(error);
    const pendingRequest = pending.shift();
    if (pendingRequest) {
      pendingRequest.reject(new Error(error.message || error.code));
    }
  };

  const handleTextMessage = (text: string) => {
    const parsed = parseJsonError(text);
    if (parsed) {
      handleServerError(parsed);
      return;
    }
    dispatchError({
      code: "INVALID_MESSAGE",
      message: "Received non-binary message from WebSocket.",
    });
  };

  const handleBinaryMessage = async (event: MessageEvent) => {
    const bytes = await getBytesFromEvent(event);
    if (!bytes) {
      dispatchError({
        code: "INVALID_MESSAGE",
        message: "Received non-binary message from WebSocket.",
      });
      return;
    }

    const decoded = decodeServerMessage(bytes);
    if (!decoded) {
      dispatchError({
        code: "DECODE_FAILED",
        message: "Failed to decode server message.",
      });
      return;
    }

    if (decoded.error) {
      handleServerError(decoded.error);
      return;
    }

    if (decoded.ack) {
      handleServerAck(decoded.ack);
    }
  };

  const handleSocketMessage = async (event: MessageEvent) => {
    if (typeof event.data === "string") {
      handleTextMessage(event.data);
      return;
    }

    await handleBinaryMessage(event);
  };

  const ensureOpen = async () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return;
    }
    if (!openPromise) {
      openPromise = new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        socket = ws;

        const cleanup = () => {
          ws.removeEventListener("open", handleOpen);
          ws.removeEventListener("error", handleError);
          ws.removeEventListener("close", handleClose);
        };

        const handleOpen = () => {
          cleanup();
          resolve();
        };

        const handleError = () => {
          cleanup();
          reject(new Error("WebSocket connection failed"));
        };

        const handleClose = () => {
          cleanup();
          reject(new Error("WebSocket closed"));
        };

        ws.addEventListener("open", handleOpen);
        ws.addEventListener("error", handleError);
        ws.addEventListener("close", handleClose);

        ws.addEventListener("message", (event) => {
          handleSocketMessage(event).catch((err) => {
            dispatchError({
              code: "UNKNOWN",
              message: err instanceof Error ? err.message : String(err),
            });
          });
        });
      });
    }

    await openPromise;
  };

  const sendWithAck = async (bytes: Uint8Array) => {
    await ensureOpen();
    if (!socket) {
      throw new Error("WebSocket not available");
    }
    const ackPromise = new Promise<string>((resolve, reject) => {
      pending.push({ resolve, reject });
    });
    socket.send(bytes);
    return ackPromise;
  };

  return {
    async connect() {
      if (!helloCredentials) {
        throw new Error("HELLO_AUTH_REQUIRED");
      }

      await ensureOpen();
      await sendWithAck(encodeHello(helloCredentials));
    },
    ping() {
      return sendWithAck(encodePhase("ping"));
    },
    async notifyUnsupportedDevice() {
      await sendWithAck(encodePhase("unsupported_device"));
    },
    async sendPhase(phase: string, error?: string) {
      await sendWithAck(encodePhase(phase, error));
    },
    async sendData(kind: number, raw: Uint8Array, index = 0, total = 0) {
      await sendWithAck(encodeData(kind, raw, index, total));
    },
    close() {
      if (socket) {
        socket.close();
      }
      socket = null;
      openPromise = null;
      pending.splice(0, pending.length);
    },
  };
}
