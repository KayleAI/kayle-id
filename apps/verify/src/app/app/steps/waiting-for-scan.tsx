import { Button } from "@kayleai/ui/button";
import { useVerificationStore } from "../../../stores/session";
import { StepLayout } from "./shared";

export function WaitingForScanScreen() {
  const resetForRetry = useVerificationStore((state) => state.resetForRetry);

  return (
    <StepLayout
      actions={
        <Button onClick={resetForRetry} type="button" variant="outline">
          Cancel
        </Button>
      }
      description="Open Kayle ID on your phone and scan the QR code on this page to continue."
      title="Waiting for your phone"
    />
  );
}
