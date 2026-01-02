import { client } from "@kayle-id/auth/client";
import { useAuth } from "@kayle-id/auth/client/provider";
import { Button } from "@kayleai/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@kayleai/ui/input-otp";
import { Logo } from "@kayleai/ui/logo";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Route } from "@/routes/_auth/verify";

export function Verify() {
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  const { email: emailParam } = Route.useSearch();
  const { refresh } = useAuth();

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { data, error: errorMessage } = await client.magic.verifyOTP({
        email,
        otp,
        type: "sign-in",
      });

      if (data?.status) {
        // Redirect to dashboard or home page after successful verification
        await refresh();
        navigate({ to: "/dashboard" });
      } else {
        setError(errorMessage?.message || "Invalid code. Please try again.");
      }
    } catch {
      setError("Invalid code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = useCallback((value: string) => {
    setOtp(value);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Header */}
        <div>
          <div className="mb-8">
            <Logo className="" title="Kayle ID" />
          </div>
          <h1 className="mb-4 font-light text-3xl text-neutral-900 tracking-tight">
            Check your email
          </h1>
          <p className="text-lg text-neutral-600">
            We&apos;ve sent a 6-digit verification code to{" "}
            {email && (
              <span className="font-medium text-neutral-950">{email}</span>
            )}
          </p>
        </div>

        {/* OTP Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* OTP Input Fields */}
          <fieldset>
            <legend className="mb-2 text-neutral-500">
              <span className="text-sm">Verification code</span>
            </legend>
            <InputOTP
              containerClassName="w-full"
              disabled={isLoading}
              maxLength={6}
              onChange={handleOtpChange}
              required
              value={otp}
            >
              <InputOTPGroup className="flex-1 gap-0">
                <InputOTPSlot
                  className="h-12! flex-1 rounded-l-4xl text-lg"
                  index={0}
                />
                <InputOTPSlot className="h-12! flex-1 text-lg" index={1} />
                <InputOTPSlot
                  className="h-12! flex-1 rounded-r-4xl text-lg"
                  index={2}
                />
              </InputOTPGroup>
              <InputOTPSeparator className="mx-2" />
              <InputOTPGroup className="flex-1 gap-0">
                <InputOTPSlot
                  className="h-12! flex-1 rounded-l-4xl text-lg"
                  index={3}
                />
                <InputOTPSlot className="h-12! flex-1 text-lg" index={4} />
                <InputOTPSlot
                  className="h-12! flex-1 rounded-r-4xl text-lg"
                  index={5}
                />
              </InputOTPGroup>
            </InputOTP>
          </fieldset>

          <div className="relative mx-auto flex max-w-md flex-row items-center justify-center gap-3">
            <Button
              className="w-fit flex-1"
              disabled={isLoading}
              nativeButton={false}
              render={<Link to="/sign-in">Back</Link>}
              variant="secondary"
            >
              Back
            </Button>

            <Button
              className="w-fit flex-1"
              disabled={isLoading || otp.length !== 6}
              type="submit"
            >
              {isLoading ? "Verifying..." : "Verify code"}
            </Button>
          </div>
        </form>

        {/* Footer Links */}
        <p className="inline-block text-center text-muted-foreground text-xs">
          By signing in to Kayle ID, you agree to our{" "}
          <Button
            className="inline-block h-fit! p-0 text-foreground text-xs!"
            nativeButton={false}
            render={
              <a href="/terms" rel="noopener noreferrer" target="_blank">
                Terms of Service
              </a>
            }
            variant="link"
          />{" "}
          and{" "}
          <Button
            className="inline-block h-fit! p-0 text-foreground text-xs!"
            nativeButton={false}
            render={
              <a href="/privacy" rel="noopener noreferrer" target="_blank">
                Privacy Policy
              </a>
            }
            variant="link"
          />
        </p>
      </div>
    </div>
  );
}
