import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import { useLoaderData } from "@tanstack/react-router";
import InfoCard from "@/components/info";
import Spinner from "@/icons/spinner";
import { SessionProvider, useSession } from "./session-provider";

export function VerificationApp() {
  const { sessionId } = useLoaderData({
    from: "/$",
  });

  return (
    <SessionProvider sessionId={sessionId}>
      <SessionApp />
      <SessionError />
      <SessionLoader />
    </SessionProvider>
  );
}

function SessionApp() {
  const { session } = useSession();

  if (!session) {
    return null;
  }

  // TODO: Add the session app here.
  return null;
}

function SessionLoader() {
  const { session, error } = useSession();

  if (session || error) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-1 grow items-center justify-center">
      <Spinner className="size-9 animate-spin" />
    </div>
  );
}

function SessionError() {
  const { error } = useSession();

  if (!error) {
    return null;
  }

  const errorMessage =
    ERROR_MESSAGES[error.code as keyof typeof ERROR_MESSAGES] ??
    ERROR_MESSAGES.UNKNOWN;

  return (
    <InfoCard
      colour="red"
      header={{
        title: "Session Error",
        description: "An error occurred while loading the session.",
      }}
      message={{
        title: errorMessage.title,
        description: errorMessage.description,
      }}
    />
  );
}
