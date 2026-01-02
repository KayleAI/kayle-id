import { Button } from "@kayleai/ui/button";
import { Logo } from "@kayleai/ui/logo";
import { useVerificationStore } from "../../stores/session";

/**
 * This component is used to explain the verification process to the user.
 */
export function SessionExplain() {
  const goToConsent = useVerificationStore((state) => state.goToConsent);

  return (
    <div className="relative flex w-full flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div>
          <div className="mb-8">
            <Logo className="" title="Kayle ID" />
          </div>
          <h1 className="mb-4 font-light text-3xl text-foreground tracking-tight">
            Verify your identity with Kayle ID
          </h1>
          <p className="text-lg text-muted-foreground">
            Kayle ID lets you verify your identity using your passport's NFC
            chip and a selfie.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 font-medium text-base text-foreground">
              This process:
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-base text-muted-foreground">
              <li>Confirms that your passport is genuine</li>
              <li>Confirms that you are the passport holder</li>
              <li>
                Shares only the verification result and details you choose to
                share with{" "}
                <span className="font-bold text-foreground underline decoration-dashed underline-offset-2">
                  Platform Name
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 font-medium text-base text-foreground">
              Kayle ID:
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-base text-muted-foreground">
              <li>Does not store your passport or selfie</li>
              <li>Does not create an account for you</li>
              <li>Processes data only for this verification session</li>
            </ul>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col space-y-4">
          <Button onClick={goToConsent} type="button">
            Continue
          </Button>
          <Button
            onClick={() => window.history.back()}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
