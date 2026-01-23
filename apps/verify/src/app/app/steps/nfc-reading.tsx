import { Button } from "@kayleai/ui/button";
import { useVerificationStore } from "../../../stores/session";
import { StepLayout } from "./shared";

export function NFCReadingScreen() {
  const resetForRetry = useVerificationStore((state) => state.resetForRetry);

  return (
    <StepLayout
      actions={
        <Button onClick={resetForRetry} type="button" variant="outline">
          Cancel
        </Button>
      }
      description="Hold your phone against your passport's photo page or your ID card to read the secure chip. Keep it still until it finishes. If it doesn’t start, move your phone slightly and try again."
      title="Reading the chip"
    />
  );
}
