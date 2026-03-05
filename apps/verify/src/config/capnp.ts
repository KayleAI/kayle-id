import {
  decodeServerMessage,
  encodeClientData,
  encodeClientHello,
  encodeClientPhase,
} from "@kayle-id/capnp/verify-codec";
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

const encodeHello = ({
  attemptId,
  mobileWriteToken,
  deviceId,
  appVersion,
}: HelloCredentials): Uint8Array =>
  encodeClientHello({
    attemptId,
    mobileWriteToken,
    deviceId,
    appVersion,
  });

const encodePhase = (phase: string, error?: string): Uint8Array =>
  encodeClientPhase({ phase, error });

const encodeData = (
  kind: number,
  raw: Uint8Array,
  index: number,
  total: number
): Uint8Array =>
  encodeClientData({
    kind,
    raw,
    index,
    total,
  });

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
      handleServerAck(decoded.ack.message);
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
