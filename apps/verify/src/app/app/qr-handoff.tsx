import type {
  BootstrapResponse,
  QRCodePayload,
} from "@kayle-id/config/e2ee-types";
import { Button } from "@kayleai/ui/button";
import { Logo } from "@kayleai/ui/logo";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { env } from "@/config/env";
import { type ECDHKeypair, generateEphemeralKeypair } from "@/utils/crypto";
import { useVerificationStore } from "../../stores/session";

/**
 * Build the API URL for bootstrap endpoint.
 */
function buildBootstrapUrl(sessionId: string): string {
  const host = env.PUBLIC_API_HOST;

  if (process.env.NODE_ENV === "development") {
    return `http://${window.location.hostname}:8787/v1/verify/sessions/${sessionId}/bootstrap`;
  }

  return `https://${host}/v1/verify/sessions/${sessionId}/bootstrap`;
}

type BootstrapState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: BootstrapResponse; keypair: ECDHKeypair }
  | { status: "error"; error: string };

type QRHandoffProps = {
  sessionId: string;
};

/**
 * QR Handoff step - displays a QR code for the user to scan with their mobile device.
 *
 * This is a first-class step in the verification flow, not an error state.
 * The user sees this after consenting, and it allows them to continue
 * the verification on their mobile device which has NFC/camera capabilities.
 */
export function QRHandoff({ sessionId }: QRHandoffProps) {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({
    status: "idle",
  });

  // Ref to track if bootstrap has been initiated (survives StrictMode remount)
  const bootstrapInitiatedRef = useRef(false);

  const setAttemptId = useVerificationStore((state) => state.setAttemptId);
  const setClientPublicKey = useVerificationStore(
    (state) => state.setClientPublicKey
  );
  const setBootstrapData = useVerificationStore(
    (state) => state.setBootstrapData
  );
  const goToConsent = useVerificationStore((state) => state.goToConsent);
  const goToWaitingForMobile = useVerificationStore(
    (state) => state.goToWaitingForMobile
  );
  const mobilePhase = useVerificationStore((state) => state.mobilePhase);

  // Check if we already have an attempt from a previous mount (StrictMode)
  const existingAttemptId = useVerificationStore((state) => state.attemptId);
  const existingPublicKey = useVerificationStore(
    (state) => state.clientPublicKey
  );
  const existingBootstrapData = useVerificationStore(
    (state) => state.bootstrapData
  );

  /**
   * Generate keypair and call bootstrap endpoint.
   */
  const bootstrap = useCallback(async () => {
    // Skip if already initiated (handles StrictMode double-mount)
    if (bootstrapInitiatedRef.current) {
      console.log("[QRHandoff] Bootstrap already initiated, skipping");
      return;
    }

    // Skip if we already have an attempt from a previous render
    if (existingAttemptId && existingPublicKey) {
      console.log("[QRHandoff] Reusing existing attempt:", existingAttemptId);
      return;
    }

    bootstrapInitiatedRef.current = true;
    setBootstrapState({ status: "loading" });

    try {
      // Generate ephemeral ECDH keypair
      const keypair = await generateEphemeralKeypair();

      // Call bootstrap endpoint
      const response = await fetch(buildBootstrapUrl(sessionId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_public_key: keypair.publicKey,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(errorData.error?.message ?? `HTTP ${response.status}`);
      }

      const result = (await response.json()) as {
        data: BootstrapResponse;
        error: null;
      };

      // Store attempt ID, public key, and bootstrap data in verification store
      setAttemptId(result.data.attempt_id);
      setClientPublicKey(keypair.publicKey);
      setBootstrapData(result.data);

      setBootstrapState({
        status: "success",
        data: result.data,
        keypair,
      });
    } catch (error) {
      bootstrapInitiatedRef.current = false; // Allow retry on error
      setBootstrapState({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [
    sessionId,
    existingAttemptId,
    existingPublicKey,
    setAttemptId,
    setClientPublicKey,
    setBootstrapData,
  ]);

  // Bootstrap immediately when component mounts
  useEffect(() => {
    if (bootstrapState.status === "idle") {
      bootstrap();
    }
  }, [bootstrapState.status, bootstrap]);

  // Auto-advance to waiting screen when mobile connects
  useEffect(() => {
    if (mobilePhase && mobilePhase !== "initialized") {
      goToWaitingForMobile();
    }
  }, [mobilePhase, goToWaitingForMobile]);

  /**
   * Build the QR code payload.
   * Uses bootstrap data from store (survives StrictMode remount) or local state.
   */
  const qrPayload = useMemo((): string | null => {
    // First try to use stored bootstrap data (for StrictMode remount recovery)
    if (existingBootstrapData && existingPublicKey) {
      const payload: QRCodePayload = {
        session_id: existingBootstrapData.session_id,
        attempt_id: existingBootstrapData.attempt_id,
        mobile_write_token: existingBootstrapData.mobile_write_token,
        client_public_key: existingPublicKey,
        crypto_version: existingBootstrapData.crypto_version,
        token_exp: existingBootstrapData.token_exp,
        sig: existingBootstrapData.sig,
      };
      return `kayle://${JSON.stringify(payload)}`;
    }

    // Fall back to local state if bootstrap just completed
    if (bootstrapState.status !== "success") {
      return null;
    }

    const payload: QRCodePayload = {
      session_id: bootstrapState.data.session_id,
      attempt_id: bootstrapState.data.attempt_id,
      mobile_write_token: bootstrapState.data.mobile_write_token,
      client_public_key: bootstrapState.keypair.publicKey,
      crypto_version: bootstrapState.data.crypto_version,
      token_exp: bootstrapState.data.token_exp,
      sig: bootstrapState.data.sig,
    };

    // Use JSON directly (no base64) for smaller QR code size
    // Prefix with "kayle://" URI scheme for mobile app recognition
    return `kayle://${JSON.stringify(payload)}`;
  }, [bootstrapState, existingBootstrapData, existingPublicKey]);

  /**
   * Handle retry after error.
   */
  const handleRetry = useCallback(() => {
    setBootstrapState({ status: "idle" });
  }, []);

  return (
    <div className="relative flex w-full flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div>
          <div className="mb-8">
            <Logo className="" title="Kayle ID" />
          </div>
          <h1 className="mb-4 font-light text-3xl text-foreground tracking-tight">
            Continue on your phone
          </h1>
          <p className="text-lg text-muted-foreground">
            Scan this QR code in the Kayle ID app to verify using your passport
            or national ID card.
          </p>
        </div>

        {/* QR Code Section */}
        <div className="flex flex-col items-center space-y-6">
          <div className="flex items-center justify-center rounded-2xl border-2 border-border bg-white p-6">
            {/* Show QR code if we have a payload (from store or local state) */}
            {qrPayload ? (
              <QRCodeSVG
                bgColor="#FFFFFF"
                fgColor="#000000"
                level="M"
                size={256}
                value={qrPayload}
              />
            ) : // biome-ignore lint/style/noNestedTernary: it's fine
            bootstrapState.status === "error" ? (
              <div className="flex size-[256px] flex-col items-center justify-center gap-4">
                <p className="text-center text-destructive text-sm">
                  {bootstrapState.error}
                </p>
                <Button onClick={handleRetry} size="sm" variant="outline">
                  Retry
                </Button>
              </div>
            ) : (
              /* Loading state */
              <div className="size-[256px] animate-pulse rounded-lg bg-muted" />
            )}
          </div>

          {qrPayload && (
            <p className="text-center text-muted-foreground text-sm">
              Expires in 5 minutes
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
          <h3 className="font-medium text-foreground text-sm">How it works:</h3>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground text-sm">
            <li>Open Kayle ID on your phone</li>
            <li>Tap "Scan QR Code" point your camera at the code</li>
            <li>
              Follow the prompts to scan your passport or national ID card and
              take a selfie
            </li>
            <li>We’ll finish here automatically</li>
          </ol>
        </div>

        {/* Back Button */}
        <div className="flex flex-col space-y-4">
          <Button onClick={goToConsent} type="button" variant="outline">
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
