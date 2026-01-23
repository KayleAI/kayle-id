import { useCallback, useEffect, useState } from "react";
import InfoCard from "@/components/info";
import { env } from "@/config/env";
import { useVerificationStore } from "../../stores/session";

/**
 * Build the API URL for check endpoint.
 */
function buildCheckUrl(sessionId: string): string {
  const protocol =
    env.PUBLIC_API_PROTOCOL ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const host = env.PUBLIC_API_HOST;

  if (process.env.NODE_ENV === "development") {
    return `${protocol}://${window.location.hostname}:8787/v1/verify/sessions/${sessionId}/check`;
  }

  return `${protocol.replace("ws", "http")}://${host}/v1/verify/sessions/${sessionId}/check`;
}

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      passed: boolean;
      scores: { liveness: number; match: number };
    }
  | { status: "error"; error: string };

type VerificationResultProps = {
  sessionId: string;
};

/**
 * Component that performs verification check and displays results.
 * Called when all data (MRZ, NFC, selfie) has been received from mobile.
 */
export function VerificationResult({ sessionId }: VerificationResultProps) {
  const [checkState, setCheckState] = useState<CheckState>({ status: "idle" });

  const decryptedData = useVerificationStore((state) => state.decryptedData);
  const setVerificationResult = useVerificationStore(
    (state) => state.setVerificationResult
  );
  const resetForRetry = useVerificationStore((state) => state.resetForRetry);
  const goToShareDetails = useVerificationStore(
    (state) => state.goToShareDetails
  );

  /**
   * Perform verification check with the API.
   */
  const performCheck = useCallback(async () => {
    if (checkState.status === "loading") {
      return;
    }

    if (!(decryptedData.nfc?.dg2.faceImage && decryptedData.selfie?.image)) {
      setCheckState({
        status: "error",
        error: "Missing required data for verification.",
      });
      return;
    }

    setCheckState({ status: "loading" });

    try {
      const response = await fetch(buildCheckUrl(sessionId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_photo: decryptedData.nfc.dg2.faceImage,
          selfie_image: decryptedData.selfie.image,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(errorData.error?.message ?? `HTTP ${response.status}`);
      }

      const result = (await response.json()) as {
        data: {
          passed: boolean;
          liveness_score: number;
          match_score: number;
          codes: string[];
        };
        error: null;
      };

      // Store result in verification store
      setVerificationResult({
        passed: result.data.passed,
        livenessScore: result.data.liveness_score,
        matchScore: result.data.match_score,
        codes: result.data.codes,
      });

      setCheckState({
        status: "success",
        passed: result.data.passed,
        scores: {
          liveness: result.data.liveness_score,
          match: result.data.match_score,
        },
      });
    } catch (error) {
      setCheckState({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [sessionId, decryptedData, checkState.status, setVerificationResult]);

  // Auto-run check when component mounts
  useEffect(() => {
    if (checkState.status === "idle") {
      performCheck();
    }
  }, [checkState.status, performCheck]);

  // Loading state
  if (checkState.status === "idle" || checkState.status === "loading") {
    return (
      <InfoCard
        colour="blue"
        footer={false}
        header={{
          title: "Verifying",
          description: "Please wait while we verify your identity.",
        }}
        message={{
          title: "Processing...",
          description: "Performing liveness detection and face matching.",
        }}
      />
    );
  }

  // Error state
  if (checkState.status === "error") {
    return (
      <InfoCard
        buttons={{
          primary: {
            label: "Retry",
            onClick: () => {
              setCheckState({ status: "idle" });
              performCheck();
            },
          },
          secondary: {
            label: "Start Over",
            onClick: resetForRetry,
          },
        }}
        colour="red"
        footer={false}
        header={{
          title: "Verification Failed",
          description: "An error occurred during verification.",
        }}
        message={{
          title: "Error",
          description: checkState.error,
        }}
      />
    );
  }

  // Success/Failure state
  if (checkState.passed) {
    return (
      <InfoCard
        buttons={{
          primary: {
            label: "Continue",
            onClick: goToShareDetails,
          },
        }}
        colour="emerald"
        footer={false}
        header={{
          title: "Verification Successful",
          description: "Your identity has been verified.",
        }}
        message={{
          title: "You're verified!",
          description: `Liveness: ${Math.round(checkState.scores.liveness * 100)}% | Match: ${Math.round(checkState.scores.match * 100)}%`,
        }}
      />
    );
  }

  // Verification failed
  return (
    <InfoCard
      buttons={{
        primary: {
          label: "Try Again",
          onClick: resetForRetry,
        },
        secondary: {
          label: "Cancel",
          onClick: () => window.history.back(),
        },
      }}
      colour="red"
      footer={false}
      header={{
        title: "Verification Failed",
        description: "We couldn't verify your identity.",
      }}
      message={{
        title: "Please try again",
        description:
          "Make sure you're in good lighting and your face is clearly visible.",
      }}
    />
  );
}
