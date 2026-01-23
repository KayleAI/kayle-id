import type { AttemptPhase } from "@kayle-id/config/e2ee-types";
import { AnimatePresence } from "motion/react";
import { useVerificationStore } from "../../stores/session";
import { CompleteScreen } from "./steps/complete";
import { ErrorScreen } from "./steps/error";
import { MobileConnectedScreen } from "./steps/mobile-connected";
import { MRZCompleteScreen } from "./steps/mrz-complete";
import { MRZScanningScreen } from "./steps/mrz-scanning";
import { NFCCompleteScreen } from "./steps/nfc-complete";
import { NFCReadingScreen } from "./steps/nfc-reading";
import { SelfieCapturingScreen } from "./steps/selfie-capturing";
import { SelfieCompleteScreen } from "./steps/selfie-complete";
import { FadeTransition } from "./steps/shared";
import { UploadingScreen } from "./steps/uploading";
import { WaitingForScanScreen } from "./steps/waiting-for-scan";

/**
 * Component shown while waiting for mobile device to upload captured data.
 * Displays custom screens for each verification phase with fade transitions.
 */
export function WaitingForMobile() {
  const mobilePhase = useVerificationStore((state) => state.mobilePhase);

  // Default to initialized if no phase yet
  const currentPhase: AttemptPhase = mobilePhase ?? "initialized";

  // Render the appropriate screen based on current phase
  const renderScreen = () => {
    switch (currentPhase) {
      case "initialized":
        return <WaitingForScanScreen />;
      case "mobile_connected":
        return <MobileConnectedScreen />;
      case "mrz_scanning":
        return <MRZScanningScreen />;
      case "mrz_complete":
        return <MRZCompleteScreen />;
      case "nfc_reading":
        return <NFCReadingScreen />;
      case "nfc_complete":
        return <NFCCompleteScreen />;
      case "selfie_capturing":
        return <SelfieCapturingScreen />;
      case "selfie_complete":
        return <SelfieCompleteScreen />;
      case "uploading":
        return <UploadingScreen />;
      case "complete":
        return <CompleteScreen />;
      case "error":
      case "expired":
      case "client_disconnected":
        return <ErrorScreen />;
      default:
        return <WaitingForScanScreen />;
    }
  };

  return (
    <AnimatePresence mode="wait">
      <FadeTransition key={currentPhase}>{renderScreen()}</FadeTransition>
    </AnimatePresence>
  );
}
