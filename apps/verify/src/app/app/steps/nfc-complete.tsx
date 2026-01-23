import { Button } from "@kayleai/ui/button";
import { useVerificationStore } from "../../../stores/session";
import { StepLayout } from "./shared";

export function NFCCompleteScreen() {
  const resetForRetry = useVerificationStore((state) => state.resetForRetry);

  return (
    <StepLayout
      actions={
        <Button onClick={resetForRetry} type="button" variant="outline">
          Cancel verification
        </Button>
      }
      description="We've successfully read the chip in your ID."
      title="Chip read complete"
    />
  );
}
