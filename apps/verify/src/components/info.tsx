import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { Logo } from "@/components/logo";
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
    <div className="relative flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div>
          <div className="mb-8">
            <Logo className="" />
          </div>
          <h1 className="mb-4 font-light text-3xl text-neutral-900 tracking-tight">
            {header.title}
          </h1>
          <p className="text-lg text-neutral-600">{header.description}</p>
        </div>

        {/* Message */}
        <div className={clsx("rounded-lg p-4", classes[colour].container)}>
          <div className="flex items-start">
            <div className="mt-0.5 shrink-0">{icon[colour]}</div>
            <div className="ml-3">
              <h3
                className={clsx("font-medium text-sm", classes[colour].title)}
              >
                {message.title}
              </h3>
              <div className={clsx("text-sm", classes[colour].description)}>
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
        <p className="text-center text-neutral-500 text-xs">
          By using Kayle ID, you agree to our{" "}
          <Link
            className="text-neutral-900"
            rel="noopener noreferrer"
            target="_blank"
            to="/terms"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            className="text-neutral-900"
            rel="noopener noreferrer"
            target="_blank"
            to="/privacy"
          >
            Privacy Policy
          </Link>
          .
        </p>
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
    <button
      className="w-full rounded-full bg-neutral-900 px-4 py-3 text-center font-medium text-sm text-white transition-all duration-200 ease-in-out hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:opacity-50"
      disabled={button.disabled}
      onClick={button.onClick}
      type="button"
    >
      {button.label}
    </button>
  ) : (
    <Link
      className="w-full rounded-full bg-neutral-900 px-4 py-3 text-center font-medium text-sm text-white transition-all duration-200 ease-in-out hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
      to={button.href ?? "/sign-in"}
    >
      {button.label ?? "Sign In"}
    </Link>
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
    <button
      className="w-full rounded-full border border-neutral-200 bg-white px-4 py-3 text-center font-medium text-neutral-900 text-sm transition-all duration-200 ease-in-out hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:opacity-50"
      disabled={button.disabled}
      onClick={button.onClick}
      type="button"
    >
      {button.label}
    </button>
  ) : (
    <Link
      className="w-full rounded-full border border-neutral-200 bg-white px-4 py-3 text-center font-medium text-neutral-900 text-sm transition-all duration-200 ease-in-out hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
      to={button.href ?? "/home"}
    >
      {button.label ?? "Go Home"}
    </Link>
  );
}
