import { Button } from "@kayleai/ui/button";
import { Checkbox } from "@kayleai/ui/checkbox";
import { Label } from "@kayleai/ui/label";
import { Logo } from "@kayleai/ui/logo";
import { useState } from "react";
import { useVerificationStore } from "../../stores/session";

/**
 * This component is used to get the user's consent to completing Identity Verification with Kayle ID.
 */
export function SessionConsent() {
  const [consentChecked, setConsentChecked] = useState(false);
  const goToPassportCapture = useVerificationStore(
    (state) => state.goToPassportCapture
  );
  const goToExplain = useVerificationStore((state) => state.goToExplain);

  const handleStartVerification = () => {
    if (consentChecked) {
      goToPassportCapture();
    }
  };

  return (
    <div className="relative flex w-full flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div>
          <div className="mb-8">
            <Logo className="" />
          </div>
          <h1 className="mb-4 font-light text-3xl text-foreground tracking-tight">
            Your consent is required
          </h1>
          <p className="text-lg text-muted-foreground">
            To continue, you must agree to the following:
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4">
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>I allow Kayle ID to read data from my passport</li>
            <li>
              I allow Kayle ID to capture a selfie to confirm I am the passport
              holder
            </li>
            <li>
              I allow Kayle ID to share the verification result and details I
              choose to share with{" "}
              <span className="font-bold text-foreground underline decoration-dashed underline-offset-2">
                Platform Name
              </span>
            </li>
          </ul>

          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Checkbox
                checked={consentChecked}
                className="size-7 rounded-full"
                id="consent"
                onCheckedChange={(checked) =>
                  setConsentChecked(checked === true)
                }
              />
              <Label
                className="block font-normal text-muted-foreground! text-sm leading-normal"
                htmlFor="consent"
              >
                I agree to the{" "}
                <Button
                  className="inline-block h-fit! p-0 text-foreground text-sm!"
                  nativeButton={false}
                  render={
                    <a href="/terms" rel="noopener noreferrer" target="_blank">
                      Terms of Service
                    </a>
                  }
                  variant="link"
                >
                  Terms of Service
                </Button>{" "}
                and{" "}
                <Button
                  className="inline-block h-fit! p-0 text-foreground text-sm!"
                  nativeButton={false}
                  render={
                    <a
                      href="/privacy"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Privacy Notice
                    </a>
                  }
                  variant="link"
                >
                  Privacy Notice
                </Button>{" "}
                and consent to identity verification.
              </Label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col space-y-4">
          <Button
            disabled={!consentChecked}
            onClick={handleStartVerification}
            type="button"
          >
            Start verification
          </Button>
          <Button onClick={goToExplain} type="button" variant="outline">
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
