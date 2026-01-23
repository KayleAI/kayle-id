import { Button } from "@kayleai/ui/button";
import { useVerificationStore } from "../../../stores/session";
import { StepLayout } from "./shared";

export function MRZScanningScreen() {
  const resetForRetry = useVerificationStore((state) => state.resetForRetry);

  return (
    <StepLayout
      actions={
        <Button onClick={resetForRetry} type="button" variant="outline">
          Cancel
        </Button>
      }
      description="Locate the machine-readable zone (the lines of letters and numbers). On passports it’s on the photo page; on many ID cards it’s on the back."
      title="Scan your document"
    />
  );
}
