import { Button } from "@kayleai/ui/button";
import { useVerificationStore } from "../../../stores/session";
import { StepLayout } from "./shared";

export function ErrorScreen() {
  const mobilePhaseError = useVerificationStore(
    (state) => state.mobilePhaseError
  );
  const resetForRetry = useVerificationStore((state) => state.resetForRetry);
  const goToQRHandoff = useVerificationStore((state) => state.goToQRHandoff);

  return (
    <StepLayout
      actions={
        <>
          <Button onClick={goToQRHandoff} type="button">
            Try again
          </Button>
          <Button onClick={resetForRetry} type="button" variant="outline">
            Start over
          </Button>
        </>
      }
      description={mobilePhaseError ?? "An error occurred during verification."}
      title="Something went wrong"
    />
  );
}
