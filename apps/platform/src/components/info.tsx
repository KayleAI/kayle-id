import { Button } from "@kayleai/ui/button";
import { Logo } from "@kayleai/ui/logo";
import { cn } from "@kayleai/ui/utils/cn";
import { Link } from "@tanstack/react-router";
import OctagonCheck from "@/icons/octagon-check";
import OctagonInfo from "@/icons/octagon-info";
import OctagonAlert from "@/icons/octagon-warning";

export default function InfoCard({
  colour = "red",
  header = {
    title: "Session Error",
    description: "An error occurred while loading the session.",
  },
  message = {
    title: "Something went wrong",
    description: "Something went wrong while loading the session.",
    list: [],
  },
  buttons = {
    primary: {
      label: "Try again",
      onClick: () => window.location.reload(),
    },
    secondary: {
      label: "Go back to the previous page",
      onClick: () => window.history.back(),
    },
  },
  footer = true,
}: {
  colour: "red" | "blue" | "emerald";
  header: {
    title: string;
    description: string;
  };
  message: {
    title: string;
    description: string;
    list?: string[];
  };
  buttons?: {
    primary?: {
      label: string;
    } & (
      | { href: string; onClick?: never }
      | { href?: never; onClick: () => void }
    ) &
      ({ disabled?: never } | { disabled: boolean });
    secondary?: {
      label: string;
    } & (
      | { href: string; onClick?: never }
      | { href?: never; onClick: () => void }
    ) &
      ({ disabled?: never } | { disabled: boolean });
  };
  footer?: boolean;
}) {
  const icon = {
    red: <OctagonAlert className="size-5 text-red-400" />,
    blue: <OctagonInfo className="size-5 text-blue-800" />,
    emerald: <OctagonCheck className="size-5 text-emerald-800" />,
  };

  const classes = {
    red: {
      container: "bg-red-50 border border-red-200",
      title: "text-red-800",
      description: "text-red-700",
    },
    blue: {
      container: "bg-blue-50 border border-blue-200",
      title: "text-blue-800",
      description: "text-blue-700",
    },
    emerald: {
      container: "bg-emerald-50 border border-emerald-200",
      title: "text-emerald-800",
      description: "text-emerald-700",
    },
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
            {header.title}
          </h1>
          <p className="text-lg text-muted-foreground">{header.description}</p>
        </div>

        {/* Message */}
        <div className={cn("rounded-lg p-4", classes[colour].container)}>
          <div className="flex items-start">
            <div className="mt-0.5 shrink-0">{icon[colour]}</div>
            <div className="ml-3">
              <h3 className={cn("font-medium text-sm", classes[colour].title)}>
                {message.title}
              </h3>
              <div className={cn("text-sm", classes[colour].description)}>
                <p>{message.description}</p>
                {message.list && (
                  <ul className="mt-1 list-outside list-none space-y-1">
                    {message.list.map((item) => (
                      <li key={item}>&ndash; {item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col space-y-4">
          <PrimaryButton button={buttons?.primary} />
          <SecondaryButton button={buttons?.secondary} />
        </div>

        {/* Footer Links */}
        {footer ? (
          <p className="inline-block text-center text-muted-foreground text-xs">
            By using Kayle ID, you agree to our{" "}
            <Button
              className="inline-block px-0 text-foreground text-xs!"
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
              className="inline-block px-0 text-foreground text-xs!"
              render={
                <a href="/privacy" rel="noopener noreferrer" target="_blank">
                  Privacy Policy
                </a>
              }
              variant="link"
            >
              Privacy Policy
            </Button>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PrimaryButton({
  button,
}: {
  button?: {
    label: string;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
  };
}) {
  if (!button) {
    return null;
  }

  return button.onClick ? (
    <Button disabled={button.disabled} onClick={button.onClick} type="button">
      {button.label}
    </Button>
  ) : (
    <Button
      render={
        <Link to={button.href ?? "/sign-in"}>{button.label ?? "Sign In"}</Link>
      }
      variant="default"
    />
  );
}

function SecondaryButton({
  button,
}: {
  button?: {
    label: string;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
  };
}) {
  if (!button) {
    return null;
  }

  return button.onClick ? (
    <Button
      disabled={button.disabled}
      onClick={button.onClick}
      type="button"
      variant="outline"
    >
      {button.label}
    </Button>
  ) : (
    <Button
      render={
        <Link to={button.href ?? "/home"}>{button.label ?? "Go Home"}</Link>
      }
      variant="outline"
    />
  );
}
