import { useEffect } from "react";
import { useVerificationStore } from "../../stores/session";
import { ErrorCard } from "../error";
import { useSession } from "../session-provider";
import { AppCheck } from "./app-check";
import { SessionConsent } from "./consent";
import { SessionExplain } from "./explain";
import { QRHandoff } from "./qr-handoff";
import { VerificationResult } from "./result";
import { ShareDetails } from "./share-details";
import { Teardown } from "./teardown";
import { WaitingForMobile } from "./waiting-for-mobile";

type SessionAppProps = {
  sessionId: string;
  redirectUrl?: string | null;
};

export function SessionApp({ sessionId, redirectUrl }: SessionAppProps) {
  const { sessionData, isConnected } = useSession();
  const step = useVerificationStore((state) => state.step);
  const isAllDataReceived = useVerificationStore(
    (state) => state.isAllDataReceived
  );
  const goToResult = useVerificationStore((state) => state.goToResult);

  // Auto-advance to result when all data is received
  useEffect(() => {
    if (step === "waiting-for-mobile" && isAllDataReceived()) {
      goToResult();
    }
  }, [step, isAllDataReceived, goToResult]);

  // Wait for WebSocket to connect and get session data
  if (!(isConnected || sessionData)) {
    return null;
  }

  // Get the redirect URL from props or session data
  const finalRedirectUrl = redirectUrl ?? sessionData?.redirectUrl ?? null;

  // Render components based on current verification step
  switch (step) {
    case "explain":
      return <SessionExplain />;
    case "consent":
      return <SessionConsent />;
    case "app-check":
      return <AppCheck />;
    case "qr-handoff":
      return <QRHandoff sessionId={sessionId} />;
    case "waiting-for-mobile":
      return <WaitingForMobile />;
    case "result":
      return <VerificationResult sessionId={sessionId} />;
    case "share-details":
      return <ShareDetails />;
    case "teardown":
      return <Teardown redirectUrl={finalRedirectUrl} />;
    default:
      return (
        <ErrorCard error={{ code: "UNKNOWN", message: "Unknown error" }} />
      );
  }
}
