import { useCallback, useEffect } from "react";
import InfoCard from "@/components/info";
import { useDevice } from "@/utils/use-device";
import { useVerificationStore } from "../../stores/session";
import { ErrorCard } from "../error";
import { useSession } from "../session-provider";
import { SessionConsent } from "./consent";
import { SessionExplain } from "./explain";
import { SessionNfcCapture } from "./nfc-capture";
import { SessionPassportCapture } from "./passport-capture";
import { UnsupportedDevice } from "./unsupported-device";

export function SessionApp() {
  const { session } = useSession();
  const { supported: deviceSupported } = useDevice();
  const step = useVerificationStore((state) => state.step);

  const notifyUnsupportedDevice = useCallback(async () => {
    if (!session) {
      return;
    }

    await session.notifyUnsupportedDevice();
  }, [session]);

  useEffect(() => {
    if (!deviceSupported && session) {
      notifyUnsupportedDevice();
    }
  }, [session, deviceSupported, notifyUnsupportedDevice]);

  if (!session) {
    return null;
  }

  if (!deviceSupported) {
    return <UnsupportedDevice />;
  }

  // Render components based on current verification step
  switch (step) {
    case "explain":
      return <SessionExplain />;
    case "consent":
      return <SessionConsent />;
    case "passport-capture":
      return <SessionPassportCapture />;
    case "nfc-capture":
      return <SessionNfcCapture />;
    case "selfie-capture":
    case "result":
    case "share-details":
    case "teardown":
      // Placeholder for other steps - to be implemented later
      return (
        <InfoCard
          buttons={{
            primary: {
              label: "Continue",
              onClick: () => window.location.reload(),
            },
          }}
          colour="emerald"
          footer={true}
          header={{
            title: "Verification Complete",
            description: "You have successfully verified your identity.",
          }}
          message={{
            title: "Thank you for verifying your identity",
            description: "You can now close this page.",
          }}
        />
      );
    default:
      return (
        <ErrorCard error={{ code: "UNKNOWN", message: "Unknown error" }} />
      );
  }
}
