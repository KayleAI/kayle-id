import type { VerifySession } from "@api/shared/verify";
import type { RpcStub } from "capnweb";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { initialiseSession } from "@/config/capnweb";

type SessionContextType = {
  session: RpcStub<VerifySession> | null;
  error: SessionError | null;
  onError: (callback: (sessionError: SessionError) => void) => () => void;
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

export function SessionProvider({ sessionId, children }: SessionProviderProps) {
  const [session, setSession] = useState<RpcStub<VerifySession> | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const errorCallbacksRef = useRef<Set<(sessionError: SessionError) => void>>(
    new Set()
  );
  const currentStubRef = useRef<RpcStub<VerifySession> | null>(null);

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

  const handleRpcError = useCallback(
    (rpcError: Error) => {
      try {
        const parsedError = JSON.parse(
          rpcError.message.split("bad RPC message:")[1]?.trim()
        )?.error;

        setSession(null);
        setError(parsedError);
        notifyErrorCallbacks(parsedError);
      } catch (parseError) {
        console.error("Error parsing RPC error:", parseError);
        setSession(null);
        setError({ code: "UNKNOWN", message: rpcError.message });
        notifyErrorCallbacks({ code: "UNKNOWN", message: rpcError.message });
      }
    },
    [notifyErrorCallbacks]
  );

  useEffect(() => {
    // Reset state when sessionId changes
    setSession(null);
    setError(null);

    // Dispose previous stub if it exists
    if (currentStubRef.current) {
      currentStubRef.current[Symbol.dispose]?.();
      currentStubRef.current = null;
    }

    // Create new stub with error handling
    const stub = initialiseSession(sessionId, handleRpcError);
    currentStubRef.current = stub;

    // Attempt to connect and ping
    (async () => {
      try {
        const pingResult = await stub.ping();

        console.warn(pingResult);

        // If ping succeeds, set the session
        setSession(stub);
        setError(null);
      } catch (pingError: unknown) {
        if (pingError instanceof Error) {
          handleRpcError(pingError);
        } else {
          handleRpcError(new Error(String(pingError)));
        }
      }
    })();

    // Cleanup function
    return () => {
      if (currentStubRef.current) {
        currentStubRef.current[Symbol.dispose]?.();
        currentStubRef.current = null;
      }
    };
  }, [sessionId, handleRpcError]);

  const value: SessionContextType = {
    session,
    error,
    onError,
  };

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
