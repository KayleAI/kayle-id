import { Alert, AlertDescription } from "@kayleai/ui/alert";
import { Badge } from "@kayleai/ui/badge";
import { Button } from "@kayleai/ui/button";
import { Input } from "@kayleai/ui/input";
import { Label } from "@kayleai/ui/label";
import { cn } from "@kayleai/ui/utils/cn";
import {
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  KeyIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  TerminalIcon,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";

const API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.kayle.id"
    : "http://127.0.0.1:8787";

type SessionResponse = {
  id: string;
  environment: string;
  status: string;
  redirect_url: string | null;
  verification_url: string;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = {
  formStatus: "idle" | "loading" | "error";
  apiKey: string;
  errorMessage: string;
  session: SessionResponse | null;
  isPolling: boolean;
  lastPolledAt: Date | null;
};

type FormAction =
  | { type: "SET_API_KEY"; apiKey: string }
  | { type: "SUBMIT" }
  | { type: "SUCCESS"; session: SessionResponse }
  | { type: "ERROR"; message: string }
  | { type: "RESET" }
  | { type: "POLL_UPDATE"; session: SessionResponse }
  | { type: "SET_POLLING"; isPolling: boolean };

const initialFormState: FormState = {
  formStatus: "idle",
  apiKey: "",
  errorMessage: "",
  session: null,
  isPolling: false,
  lastPolledAt: null,
};

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_API_KEY":
      return {
        ...state,
        apiKey: action.apiKey,
        formStatus: state.formStatus === "error" ? "idle" : state.formStatus,
        errorMessage: state.formStatus === "error" ? "" : state.errorMessage,
      };
    case "SUBMIT":
      return {
        ...state,
        formStatus: "loading",
        errorMessage: "",
        session: null,
        isPolling: false,
      };
    case "SUCCESS":
      return {
        ...state,
        formStatus: "idle",
        session: action.session,
        isPolling: true,
        lastPolledAt: new Date(),
      };
    case "ERROR":
      return {
        ...state,
        formStatus: "error",
        errorMessage: action.message,
        isPolling: false,
      };
    case "RESET":
      return { ...initialFormState, apiKey: state.apiKey };
    case "POLL_UPDATE":
      return {
        ...state,
        session: action.session,
        lastPolledAt: new Date(),
      };
    case "SET_POLLING":
      return { ...state, isPolling: action.isPolling };
    default:
      return state;
  }
}

function validateApiKey(apiKey: string): { valid: boolean; error?: string } {
  const trimmed = apiKey.trim();

  if (!trimmed) {
    return { valid: false, error: "Please enter an API key." };
  }

  if (trimmed.startsWith("kk_live_")) {
    return {
      valid: false,
      error:
        "Live API keys are not allowed in the sandbox. Please use a test API key (kk_test_...).",
    };
  }

  if (!trimmed.startsWith("kk_test_")) {
    return {
      valid: false,
      error:
        "Invalid API key format. Test API keys should start with 'kk_test_'.",
    };
  }

  return { valid: true };
}

const POLL_INTERVAL = 10_000;

function DetailRow({
  label,
  value,
  copyValue,
  href,
}: {
  label: string;
  value: React.ReactNode;
  copyValue?: string;
  href?: string;
}) {
  const handleCopy = async () => {
    if (copyValue) {
      await navigator.clipboard.writeText(copyValue);
      toast.success(`${label} copied`);
    }
  };

  return (
    <div className="group flex flex-col gap-1.5 py-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {copyValue && (
            <button
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              onClick={handleCopy}
              title={`Copy ${label}`}
              type="button"
            >
              <CopyIcon className="size-3" />
            </button>
          )}
          {href && (
            <a
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
              title={`Open ${label}`}
            >
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 overflow-hidden">
        {typeof value === "string" ? (
          <code className="block truncate font-mono text-sm">{value}</code>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export default function Sandbox() {
  const [state, dispatch] = useReducer(formReducer, initialFormState);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSession = useCallback(async () => {
    if (!(state.session && state.apiKey)) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/sessions/${state.session.id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${state.apiKey.trim()}`,
          },
        }
      );

      const data = (await response.json()) as {
        data: SessionResponse | null;
        error: { code: string; message: string; hint?: string } | null;
      };

      if (response.ok && data.data) {
        dispatch({ type: "POLL_UPDATE", session: data.data });

        if (["completed", "expired", "cancelled"].includes(data.data.status)) {
          dispatch({ type: "SET_POLLING", isPolling: false });
        }
      }
    } catch {
      // Silently fail
    }
  }, [state.session, state.apiKey]);

  useEffect(() => {
    if (state.isPolling && state.session) {
      pollingRef.current = setInterval(fetchSession, POLL_INTERVAL);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [state.isPolling, state.session, fetchSession]);

  const handleSubmit = async () => {
    const validation = validateApiKey(state.apiKey);

    if (!validation.valid) {
      dispatch({
        type: "ERROR",
        message: validation.error ?? "Invalid API key.",
      });
      return;
    }

    dispatch({ type: "SUBMIT" });

    try {
      const response = await fetch(`${API_BASE_URL}/v1/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${state.apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = (await response.json()) as {
        data: SessionResponse | null;
        error: { code: string; message: string; hint?: string } | null;
      };

      if (!response.ok || data.error) {
        dispatch({
          type: "ERROR",
          message:
            data.error?.message ??
            `Request failed with status ${response.status}`,
        });
        return;
      }

      if (!data.data) {
        dispatch({
          type: "ERROR",
          message: "No session data returned from the API.",
        });
        return;
      }

      dispatch({ type: "SUCCESS", session: data.data });
    } catch (err) {
      dispatch({
        type: "ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Failed to create session. Please try again.",
      });
    }
  };

  const isLoading = state.formStatus === "loading";

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Input Sidebar */}
        <div className="flex w-full flex-col">
          <div className="mb-8">
            <h3 className="flex items-center gap-2 font-semibold text-lg tracking-tight">
              <KeyIcon className="size-4 text-primary" />
              Configure
            </h3>
            <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
              Create a verification session with your test API key to test the
              integration flow.
            </p>
          </div>

          <div className="flex-1 space-y-6">
            <div className="space-y-3">
              <Label
                className="font-medium text-xs uppercase"
                htmlFor="api-key"
              >
                Test API Key
              </Label>
              <div className="relative">
                <Input
                  className="bg-background pr-10"
                  disabled={isLoading}
                  id="api-key"
                  onChange={(e) =>
                    dispatch({ type: "SET_API_KEY", apiKey: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && state.apiKey.trim()) {
                      handleSubmit();
                    }
                  }}
                  placeholder="kk_test_..."
                  type="password"
                  value={state.apiKey}
                />
                <KeyIcon className="-translate-y-1/2 absolute top-1/2 right-3 size-4 text-muted-foreground/50" />
              </div>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Use your test environment keys starting with{" "}
                <code className="rounded bg-muted px-1 py-0.5">kk_test_</code>
              </p>
            </div>

            <Button
              className="w-full shadow-sm active:scale-[0.98]"
              disabled={isLoading || !state.apiKey.trim()}
              onClick={handleSubmit}
            >
              {isLoading ? (
                <>
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <PlayIcon className="mr-2 size-3 fill-current" />
                  Create Session
                </>
              )}
            </Button>

            {state.formStatus === "error" && state.errorMessage && (
              <Alert className="bg-destructive/5 py-3" variant="destructive">
                <AlertDescription className="text-xs">
                  {state.errorMessage}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        {/* Results Pane */}
        <div className="flex flex-1 flex-col bg-background">
          <div className="flex h-14 items-center justify-between">
            <div className="flex flex-col">
              <h3 className="flex items-center gap-2 font-semibold text-lg tracking-tight">
                <CheckCircle2Icon className="size-4 text-primary" />
                Session
              </h3>
              <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
                Test the integration flow by creating a verification session.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {state.isPolling && state.session && (
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="font-medium text-[10px] uppercase tracking-wider">
                    Live
                  </span>
                </div>
              )}
              {state.session && (
                <Button
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={fetchSession}
                  size="icon"
                  variant="ghost"
                >
                  <RefreshCwIcon
                    className={cn(
                      "size-4",
                      state.formStatus === "loading" && "animate-spin"
                    )}
                  />
                </Button>
              )}
            </div>
          </div>

          <div className="relative flex-1 overflow-auto py-6">
            {state.session ? (
              <div className="divide-y">
                <DetailRow
                  copyValue={state.session.id}
                  label="Session ID"
                  value={state.session.id}
                />
                <DetailRow
                  copyValue={state.session.verification_url}
                  href={state.session.verification_url}
                  label="Verification URL"
                  value={
                    <a
                      className="truncate font-mono text-primary text-sm hover:underline"
                      href={state.session.verification_url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {state.session.verification_url}
                    </a>
                  }
                />
                <div className="grid grid-cols-2 gap-x-12">
                  <DetailRow
                    label="Environment"
                    value={
                      <span className="font-medium text-sm">
                        <Badge
                          className="capitalize"
                          variant={
                            state.session.environment === "live"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {state.session.environment}
                        </Badge>
                      </span>
                    }
                  />
                  <DetailRow
                    label="Created"
                    value={new Date(state.session.created_at).toLocaleString()}
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-12">
                  <DetailRow
                    label="Expires"
                    value={new Date(state.session.expires_at).toLocaleString()}
                  />
                  {state.session.completed_at ? (
                    <DetailRow
                      label="Completed"
                      value={new Date(
                        state.session.completed_at
                      ).toLocaleString()}
                    />
                  ) : (
                    <DetailRow
                      label="Last Polled"
                      value={
                        state.lastPolledAt
                          ? state.lastPolledAt.toLocaleTimeString()
                          : "Never"
                      }
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 rounded-2xl bg-muted/50 p-6">
                  <TerminalIcon className="size-10 text-muted-foreground/40" />
                </div>
                <h4 className="font-medium text-muted-foreground text-sm">
                  Awaiting Request
                </h4>
                <p className="mt-1.5 max-w-[280px] text-muted-foreground/60 text-xs leading-relaxed">
                  Enter your API key and click "Create Session" to see the live
                  response and track status updates.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
