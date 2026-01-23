import type {
  AttemptPhase,
  DecryptedMRZData,
  DecryptedNFCData,
  DecryptedSelfieData,
  RelayMessage,
} from "@kayle-id/config/e2ee-types";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVerificationStore } from "@/stores/session";
import { EphemeralKeypairManager } from "@/utils/crypto";

/**
 * Session data returned from the server.
 */
type SessionData = {
  id: string;
  organizationId: string;
  environment: string;
  status: string;
  redirectUrl: string | null;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Server -> Client message types
 */
type ServerMessage =
  | { type: "subscribed"; phase: AttemptPhase; attemptId: string }
  | { type: "pong" }
  | { type: "session"; data: SessionData }
  | {
      type: "phase";
      attemptId: string;
      phase: AttemptPhase;
      error?: string;
      seq?: number;
      timestamp?: number;
    }
  | {
      type: "data";
      dataType: string;
      e2ee: unknown;
      seq: number;
      timestamp: number;
    }
  | { type: "error"; message: string };

type SessionContextType = {
  /** Session data from the server */
  sessionData: SessionData | null;
  /** Whether the WebSocket is connected and subscribed */
  isConnected: boolean;
  /** Connection/session error */
  error: SessionError | null;
  /** Register an error callback */
  onError: (callback: (sessionError: SessionError) => void) => () => void;
  /** Keypair manager for E2EE */
  keypairManager: EphemeralKeypairManager;
  /** Request session data from server */
  requestSession: () => void;
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

type SessionProviderProps = {
  sessionId: string;
  children: ReactNode;
};

type SessionError = {
  code: string;
  message: string;
};

/**
 * Build WebSocket URL for the session.
 */
function buildWebSocketUrl(sessionId: string): string {
  const protocol = process.env.NODE_ENV === "development" ? "ws" : "wss";
  const host =
    process.env.NODE_ENV === "development"
      ? `${window.location.hostname}:8787`
      : "api.kayle.id";
  return `${protocol}://${host}/v1/verify/session/${sessionId}/ws`;
}

export function SessionProvider({ sessionId, children }: SessionProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [error, setError] = useState<SessionError | null>(null);

  const errorCallbacksRef = useRef<Set<(sessionError: SessionError) => void>>(
    new Set()
  );
  const keypairManagerRef = useRef<EphemeralKeypairManager>(
    new EphemeralKeypairManager()
  );
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track if we're already connecting to prevent StrictMode double-connect
  const isConnectingRef = useRef(false);

  // Get store actions
  const addReceivedMessage = useVerificationStore(
    (state) => state.addReceivedMessage
  );
  const setDecryptedMRZ = useVerificationStore(
    (state) => state.setDecryptedMRZ
  );
  const setDecryptedNFC = useVerificationStore(
    (state) => state.setDecryptedNFC
  );
  const setDecryptedSelfie = useVerificationStore(
    (state) => state.setDecryptedSelfie
  );
  const setMobilePhase = useVerificationStore((state) => state.setMobilePhase);
  const attemptId = useVerificationStore((state) => state.attemptId);
  const clientPublicKey = useVerificationStore(
    (state) => state.clientPublicKey
  );

  const notifyErrorCallbacks = useCallback((sessionError: SessionError) => {
    for (const callback of errorCallbacksRef.current) {
      try {
        callback(sessionError);
      } catch (callbackErr) {
        console.error("Error callback threw:", callbackErr);
      }
    }
  }, []);

  const onError = useCallback(
    (callback: (sessionError: SessionError) => void) => {
      errorCallbacksRef.current.add(callback);
      return () => {
        errorCallbacksRef.current.delete(callback);
      };
    },
    []
  );

  /**
   * Handle incoming relay messages.
   */
  const handleRelayMessage = useCallback(
    async (message: RelayMessage) => {
      addReceivedMessage(message);

      // Handle phase messages (not encrypted)
      if (message.type === "phase") {
        if (message.phase) {
          setMobilePhase(message.phase, message.error);
        }
        return;
      }

      // Decrypt the E2EE envelope for data messages
      if (!message.e2ee) {
        console.warn("Received data message without e2ee envelope:", message);
        return;
      }

      try {
        const keypairManager = keypairManagerRef.current;

        switch (message.type) {
          case "mrz": {
            const decrypted =
              await keypairManager.decryptAsJSON<DecryptedMRZData>(
                message.e2ee
              );
            setDecryptedMRZ(decrypted);
            break;
          }
          case "nfc": {
            const decrypted =
              await keypairManager.decryptAsJSON<DecryptedNFCData>(
                message.e2ee
              );
            setDecryptedNFC(decrypted);
            break;
          }
          case "selfie": {
            const decrypted =
              await keypairManager.decryptAsJSON<DecryptedSelfieData>(
                message.e2ee
              );
            setDecryptedSelfie(decrypted);
            break;
          }
          default: {
            console.warn("Received unknown message type:", message);
            break;
          }
        }
      } catch (decryptError) {
        console.error("Failed to decrypt message:", decryptError);
      }
    },
    [
      addReceivedMessage,
      setDecryptedMRZ,
      setDecryptedNFC,
      setDecryptedSelfie,
      setMobilePhase,
    ]
  );

  /**
   * Handle incoming WebSocket messages.
   */
  const handleMessage = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it's fine
    (event: MessageEvent) => {
      // Handle pong separately (not JSON)
      if (event.data === "pong") {
        return;
      }

      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        console.error("Failed to parse WebSocket message:", event.data);
        return;
      }

      switch (message.type) {
        case "subscribed":
          setIsConnected(true);
          if (message.phase) {
            setMobilePhase(message.phase);
          }
          break;

        case "pong":
          // Handled above, but include for completeness
          break;

        case "session":
          setSessionData(message.data);
          break;

        case "phase":
          if (message.phase) {
            setMobilePhase(message.phase, message.error);
          }
          // Also handle as relay message for the store
          handleRelayMessage(message as unknown as RelayMessage);
          break;

        case "error": {
          const errorMessage = (
            message as unknown as {
              error: {
                code: string;
                message: string;
              };
            }
          )?.error;

          setError(errorMessage);
          notifyErrorCallbacks(errorMessage);
          break;
        }

        default:
          // Handle data messages (mrz, nfc, selfie)
          if ("e2ee" in message || "phase" in message) {
            handleRelayMessage(message as unknown as RelayMessage);
          }
      }
    },
    [setMobilePhase, handleRelayMessage, notifyErrorCallbacks]
  );

  /**
   * Send a message to the WebSocket.
   */
  const sendMessage = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  /**
   * Request session data from the server.
   */
  const requestSession = useCallback(() => {
    sendMessage({ type: "get_session" });
  }, [sendMessage]);

  // Connect WebSocket and handle subscription
  useEffect(() => {
    // Prevent StrictMode double-connect
    if (isConnectingRef.current) {
      console.log("[SessionProvider] Already connecting, skipping");
      return;
    }

    isConnectingRef.current = true;
    setIsConnected(false);
    setError(null);

    const wsUrl = buildWebSocketUrl(sessionId);
    console.log("[SessionProvider] Connecting to WebSocket:", wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[SessionProvider] WebSocket connected");

      // Start ping interval for keepalive
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30_000);

      // Request session data immediately
      ws.send(JSON.stringify({ type: "get_session" }));
    };

    ws.onmessage = handleMessage;

    ws.onerror = (event) => {
      console.error("[SessionProvider] WebSocket error:", event);
      const sessionError = {
        code: "CONNECTION_ERROR",
        message: "WebSocket connection failed",
      };
      setError(sessionError);
      notifyErrorCallbacks(sessionError);
    };

    ws.onclose = (event) => {
      console.log("[SessionProvider] WebSocket closed:", {
        code: event.code,
        reason: event.reason,
      });
      setIsConnected(false);
      isConnectingRef.current = false;

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    return () => {
      console.log("[SessionProvider] Cleaning up WebSocket");
      isConnectingRef.current = false;

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [sessionId, handleMessage, notifyErrorCallbacks]);

  // Send subscribe message when attemptId and clientPublicKey are available
  useEffect(() => {
    if (!(attemptId && clientPublicKey && wsRef.current)) {
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      // Wait for connection and retry
      const checkConnection = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          clearInterval(checkConnection);
          console.log("[SessionProvider] Sending subscribe message");
          sendMessage({
            type: "subscribe",
            publicKey: clientPublicKey,
            attemptId,
          });
        }
      }, 100);

      // Clean up after 5 seconds if still not connected
      const timeout = setTimeout(() => {
        clearInterval(checkConnection);
      }, 5000);

      return () => {
        clearInterval(checkConnection);
        clearTimeout(timeout);
      };
    }

    console.log("[SessionProvider] Sending subscribe message");
    sendMessage({
      type: "subscribe",
      publicKey: clientPublicKey,
      attemptId,
    });
  }, [attemptId, clientPublicKey, sendMessage]);

  const value: SessionContextType = useMemo(
    () => ({
      sessionData,
      isConnected,
      error,
      onError,
      keypairManager: keypairManagerRef.current,
      requestSession,
    }),
    [sessionData, isConnected, error, onError, requestSession]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
