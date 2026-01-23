import { Button } from "@kayleai/ui/button";
import { useVerificationStore } from "../../../stores/session";
import { StepLayout } from "./shared";

export function SelfieCompleteScreen() {
  const resetForRetry = useVerificationStore((state) => state.resetForRetry);

  return (
    <StepLayout
      actions={
        <Button onClick={resetForRetry} type="button" variant="outline">
          Cancel
        </Button>
      }
      description="Your selfie was captured successfully."
      title="Selfie complete"
    />
  );
}
