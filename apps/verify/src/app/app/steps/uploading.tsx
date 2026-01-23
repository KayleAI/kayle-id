import { Button } from "@kayleai/ui/button";
import { useVerificationStore } from "../../../stores/session";
import { StepLayout } from "./shared";

export function UploadingScreen() {
  const resetForRetry = useVerificationStore((state) => state.resetForRetry);

  return (
    <StepLayout
      actions={
        <Button onClick={resetForRetry} type="button" variant="outline">
          Cancel
        </Button>
      }
      description="Transferring your encrypted data for verification."
      title="Sending securely"
    />
  );
}
