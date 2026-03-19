import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kayleai/ui/dialog";
import { useLoaderData } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";
import InfoCard from "@/components/info";
import type {
  HandoffPayload,
  VerifySessionStatusPayload,
} from "@/config/handoff";
import {
  requestHandoffPayload,
  requestVerifySessionStatus,
} from "@/config/handoff";
import { redirectToUrl } from "@/utils/navigation";
import { useDevice } from "@/utils/use-device";

const REDIRECT_COUNTDOWN_SECONDS = 3;
const STATUS_POLL_INTERVAL_MS = 2000;

type TerminalContent = {
  description: string;
  title: string;
};

type TerminalStateContentProps = {
  redirectCountdown: number | null;
  redirectTargetUrl: string | null;
  terminalContent: TerminalContent;
};

type HandoffStateContentProps = {
  fetchHandoffPayload: () => void;
  handoffError: string | null;
  handoffLoading: boolean;
  handoffUrl: string | null;
  os: string | null;
};

function buildHandoffUrl(payload: HandoffPayload): string {
  return `kayle-id://${encodeURIComponent(JSON.stringify(payload))}`;
}

function buildRedirectTargetUrl({
  redirectUrl,
  sessionId,
}: {
  redirectUrl: string;
  sessionId: string;
}): string {
  const targetUrl = new URL(redirectUrl, window.location.href);
  targetUrl.searchParams.set("session_id", sessionId);
  return targetUrl.toString();
}

function buildTerminalContent(
  sessionStatus: VerifySessionStatusPayload
): TerminalContent {
  if (sessionStatus.status === "cancelled") {
    return {
      description: "This verification was cancelled before it could finish.",
      title: "Verification cancelled",
    };
  }

  if (sessionStatus.status === "expired") {
    return {
      description: "This verification session expired before it could finish.",
      title: "Verification expired",
    };
  }

  const failureCode = sessionStatus.latest_attempt?.failure_code;

  if (failureCode === "passport_authenticity_failed") {
    return {
      description:
        "The document integrity checks did not pass for the latest attempt.",
      title: "Verification failed",
    };
  }

  if (failureCode === "selfie_face_mismatch") {
    return {
      description:
        "The selfie evidence did not match the passport photo on the latest attempt.",
      title: "Verification failed",
    };
  }

  if (sessionStatus.latest_attempt?.status === "failed") {
    return {
      description: "The latest verification attempt did not pass.",
      title: "Verification failed",
    };
  }

  return {
    description:
      "The verification finished successfully on your mobile device.",
    title: "Verification complete",
  };
}

function buildHeaderDescription({
  isTerminal,
  redirectTargetUrl,
}: {
  isTerminal: boolean;
  redirectTargetUrl: string | null;
}): string {
  if (!isTerminal) {
    return "You can scan this QR code with your mobile device to open the verification in the app.";
  }

  if (redirectTargetUrl) {
    return "You can continue now or wait for the automatic redirect.";
  }

  return "This verification has reached a terminal state.";
}

function TerminalStateContent({
  redirectCountdown,
  redirectTargetUrl,
  terminalContent,
}: TerminalStateContentProps) {
  return (
    <div className="space-y-4 py-2 text-center">
      <p className="text-muted-foreground text-sm">
        {terminalContent.description}
      </p>
      {redirectTargetUrl ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Redirecting in {redirectCountdown ?? REDIRECT_COUNTDOWN_SECONDS}{" "}
            second
            {(redirectCountdown ?? REDIRECT_COUNTDOWN_SECONDS) === 1 ? "" : "s"}
            .
          </p>
          <button
            className="w-full rounded-md bg-black px-4 py-2 text-sm text-white"
            onClick={() => {
              redirectToUrl(redirectTargetUrl);
            }}
            type="button"
          >
            Continue now
          </button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          You can now close this page.
        </p>
      )}
    </div>
  );
}

function HandoffStateContent({
  fetchHandoffPayload,
  handoffError,
  handoffLoading,
  handoffUrl,
  os,
}: HandoffStateContentProps) {
  if (handoffLoading) {
    return (
      <p className="py-4 text-center text-muted-foreground text-sm">
        Generating a secure handoff QR code...
      </p>
    );
  }

  if (handoffError) {
    return (
      <div className="space-y-4 py-2">
        <p className="text-center text-red-600 text-sm">{handoffError}</p>
        <button
          className="w-full rounded-md border px-4 py-2 text-sm"
          onClick={fetchHandoffPayload}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!handoffUrl) {
    return null;
  }

  return (
    <div className="space-y-4 py-2">
      {os === "ios" ? (
        <a
          className="block w-full rounded-md bg-black px-4 py-2 text-center text-sm text-white"
          href={handoffUrl}
        >
          Open Kayle ID app
        </a>
      ) : null}
      <div className="flex justify-center">
        <QRCodeSVG
          bgColor="transparent"
          fgColor="currentColor"
          level="M"
          size={200}
          value={handoffUrl}
        />
      </div>
    </div>
  );
}

function startSessionStatusPolling({
  pollSessionStatus,
}: {
  pollSessionStatus: () => Promise<void>;
}): number {
  pollSessionStatus().catch(() => {
    /* pollSessionStatus already handles its own errors */
  });

  return window.setInterval(() => {
    pollSessionStatus().catch(() => {
      /* pollSessionStatus already handles its own errors */
    });
  }, STATUS_POLL_INTERVAL_MS);
}

/**
 * This component is used to inform the user that their device is not supported for Identity Verification with Kayle ID.
 *
 * It provides a QR code for the user to scan to open the session on a mobile device.
 */
export function UnsupportedDevice() {
  const { os } = useDevice();
  const { sessionId } = useLoaderData({
    from: "/$",
  });
  const [unsupportedDeviceDialogOpen, setUnsupportedDeviceDialogOpen] =
    useState(false);
  const [handoffPayload, setHandoffPayload] = useState<HandoffPayload | null>(
    null
  );
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] =
    useState<VerifySessionStatusPayload | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null
  );

  const handoffUrl = useMemo(
    () => (handoffPayload ? buildHandoffUrl(handoffPayload) : null),
    [handoffPayload]
  );

  const redirectTargetUrl = useMemo(() => {
    if (!(sessionStatus?.is_terminal && sessionStatus.redirect_url)) {
      return null;
    }

    return buildRedirectTargetUrl({
      redirectUrl: sessionStatus.redirect_url,
      sessionId: sessionStatus.session_id,
    });
  }, [sessionStatus]);

  const terminalContent = useMemo(
    () =>
      sessionStatus?.is_terminal ? buildTerminalContent(sessionStatus) : null,
    [sessionStatus]
  );

  const fetchHandoffPayload = useCallback(async () => {
    setHandoffLoading(true);
    setHandoffError(null);
    setHandoffPayload(null);

    try {
      const payload = await requestHandoffPayload(sessionId);
      setHandoffPayload(payload);
    } catch {
      setHandoffError("Unable to generate handoff QR code.");
    } finally {
      setHandoffLoading(false);
    }
  }, [sessionId]);

  const pollSessionStatus = useCallback(async () => {
    try {
      const nextStatus = await requestVerifySessionStatus(sessionId);

      setSessionStatus((currentStatus) =>
        currentStatus?.is_terminal ? currentStatus : nextStatus
      );
    } catch {
      // Keep polling in the background. The browser only needs the first successful terminal status.
    }
  }, [sessionId]);

  const isTerminal = sessionStatus?.is_terminal ?? false;
  const shouldPollStatus = unsupportedDeviceDialogOpen && !isTerminal;
  const headerTitle =
    terminalContent?.title ?? "Scan this QR code with your mobile device";
  const headerDescription = buildHeaderDescription({
    isTerminal,
    redirectTargetUrl,
  });

  useEffect(() => {
    if (!shouldPollStatus) {
      return;
    }

    const intervalId = startSessionStatusPolling({
      pollSessionStatus,
    });

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollSessionStatus, shouldPollStatus]);

  useEffect(() => {
    if (!redirectTargetUrl) {
      setRedirectCountdown(null);
      return;
    }

    setRedirectCountdown(REDIRECT_COUNTDOWN_SECONDS);

    const countdownIntervalId = window.setInterval(() => {
      setRedirectCountdown((currentCountdown) => {
        if (currentCountdown === null) {
          return REDIRECT_COUNTDOWN_SECONDS;
        }

        return Math.max(0, currentCountdown - 1);
      });
    }, 1000);

    const redirectTimeoutId = window.setTimeout(() => {
      redirectToUrl(redirectTargetUrl);
    }, REDIRECT_COUNTDOWN_SECONDS * 1000);

    return () => {
      window.clearInterval(countdownIntervalId);
      window.clearTimeout(redirectTimeoutId);
    };
  }, [redirectTargetUrl]);

  const openMobileDialog = () => {
    setUnsupportedDeviceDialogOpen(true);
    setSessionStatus(null);
    setRedirectCountdown(null);
    fetchHandoffPayload();
  };

  return (
    <>
      <InfoCard
        buttons={{
          primary: {
            label: "Open on Mobile",
            onClick: openMobileDialog,
          },
          secondary: {
            label: "Go back to the previous page",
            onClick: () => window.history.back(),
          },
        }}
        colour="blue"
        footer={false}
        header={{
          title: "Unsupported Device",
          description: "You cannot use this device to verify your identity.",
        }}
        message={{
          title: "Switch to a Mobile Device",
          description:
            "Only mobile devices are supported for identity verification.",
        }}
      />
      <Dialog
        onOpenChange={setUnsupportedDeviceDialogOpen}
        open={unsupportedDeviceDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{headerTitle}</DialogTitle>
            <DialogDescription>{headerDescription}</DialogDescription>
          </DialogHeader>

          {isTerminal && terminalContent ? (
            <TerminalStateContent
              redirectCountdown={redirectCountdown}
              redirectTargetUrl={redirectTargetUrl}
              terminalContent={terminalContent}
            />
          ) : null}

          {isTerminal ? null : (
            <HandoffStateContent
              fetchHandoffPayload={fetchHandoffPayload}
              handoffError={handoffError}
              handoffLoading={handoffLoading}
              handoffUrl={handoffUrl}
              os={os}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
