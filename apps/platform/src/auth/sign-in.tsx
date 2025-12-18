import { client } from "@kayle-id/auth/client";
import { Button } from "@kayleai/ui/button";
import { Input } from "@kayleai/ui/input";
import { Logo } from "@kayleai/ui/logo";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

export function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const {
        data: { status: success },
        error: errorMessage,
      } = await client.magic.signIn({
        email,
        type: "sign-in",
      });

      if (success) {
        navigate({ to: "/verify", search: { email } });
      } else {
        setError(
          errorMessage?.message ||
            "Unable to send sign-in link. Please try again."
        );
      }
    } catch {
      setError("Unable to send sign-in link. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");

    try {
      await client.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });
    } catch {
      setError("Failed to sign in with Google");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Header */}
        <div>
          <div className="mb-8">
            <Logo className="" />
          </div>
          <h1 className="mb-4 font-light text-3xl text-foreground tracking-tight">
            Sign in to Kayle ID
          </h1>
          <p className="text-pretty text-lg text-muted-foreground">
            Integrate Identity Verification into your platform with ease using
            Kayle ID.
          </p>
        </div>

        {/* Sign In Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600 text-sm">
              {error}
            </div>
          )}

          <Input
            disabled={isLoading}
            id="email"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEmail(e.target.value)
            }
            placeholder="you@company.com"
            required
            type="email"
            value={email}
          />

          <Button className="w-full" disabled={isLoading} type="submit">
            {isLoading ? "Sending link..." : "Send sign-in link"}
          </Button>
        </form>

        <div className="-mt-2 relative mb-5">
          <div className="flex cursor-pointer items-center gap-3 text-xs uppercase tracking-wider">
            <div className="h-px flex-1 bg-border" />
            <span className="font-medium text-muted-foreground">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>

        {/* Google Sign In */}
        <Button
          className="flex w-full items-center justify-center gap-3 rounded-full border border-neutral-200 bg-white px-4 py-3 font-medium text-neutral-900 text-sm transition-all duration-200 ease-in-out hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading}
          onClick={handleGoogleSignIn}
          variant="outline"
        >
          <svg
            aria-label="Google logo"
            className="h-5 w-5"
            role="img"
            viewBox="0 0 24 24"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>

        {/* Footer Links */}
        <p className="inline-block text-center text-muted-foreground text-xs">
          By signing in to Kayle ID, you agree to our{" "}
          <Button
            className="inline-block h-fit! p-0 text-foreground text-xs!"
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
