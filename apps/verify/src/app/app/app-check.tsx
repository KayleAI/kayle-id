import { Button } from "@kayleai/ui/button";
import { useVerificationStore } from "../../stores/session";
import { StepLayout } from "./steps/shared";

/**
 * App Check step - asks users if they have the Kayle ID app downloaded.
 * Users can either proceed if they have it, or download it if they don't.
 */
export function AppCheck() {
  const goToQRHandoff = useVerificationStore((state) => state.goToQRHandoff);

  const handleDownload = () => {
    window.open(
      "https://handoff.kayle.id/download",
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <StepLayout
      actions={
        <>
          <Button onClick={goToQRHandoff} type="button">
            I have the app
          </Button>
          <Button onClick={handleDownload} type="button" variant="outline">
            Get the app
          </Button>
        </>
      }
      description="You’ll need the Kayle ID app on your phone. It lets you scan your passport or national ID card and take a selfie."
      title="Do you have the Kayle ID app?"
    />
  );
}
