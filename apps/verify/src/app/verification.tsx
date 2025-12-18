import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import { Layout } from "@kayleai/ui/layout";
import { useLoaderData } from "@tanstack/react-router";
import { useMemo } from "react";
import InfoCard from "@/components/info";
import Spinner from "@/icons/spinner";
import { SessionProvider, useSession } from "./session-provider";

export function VerificationApp() {
  const { sessionId } = useLoaderData({
    from: "/$",
  });

  return (
    <Layout>
      <SessionProvider sessionId={sessionId}>
        <SessionApp />
        <SessionError />
        <SessionLoader />
        <SessionEnvironment sessionId={sessionId} />
      </SessionProvider>
    </Layout>
  );
}

function SessionEnvironment({ sessionId }: { sessionId: string }) {
  const environment = useMemo(
    () => (sessionId.startsWith("vs_test_") ? "test" : "live"),
    [sessionId]
  );

  if (environment === "live") {
    return null;
  }

  return (
    <aside className="absolute inset-x-0 top-0 z-9999 flex h-2 animate-banner-in justify-center border-amber-300 border-b bg-amber-100 drop-shadow-xs">
      <div className="relative isolate flex h-fit w-fit items-center justify-center border-amber-300 border-b bg-amber-100 px-2 py-1 text-amber-800 text-sm md:h-7 md:px-0">
        <svg
          aria-hidden="true"
          className="-translate-x-[80%] absolute top-0 left-0 hidden sm:block"
          fill="none"
          height="28"
          viewBox="0 0 55 28"
          width="55"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M37.7564 27.5141L54.5397 27.5141L54.5397 1.71661e-05L0.49993 1.24418e-05L0.499929 7.10423L13.5536 7.10423C22.2825 7.10423 24.187 9.85171 28.0753 18.6829C31.186 25.7479 35.8255 27.5141 37.7564 27.5141Z"
            fill="var(--color-amber-100)"
          />
          <path
            d="M54.5 27.5L37.5 27.5C35.5691 27.5 31.1463 26.2338 28.0356 19.1688C24.1473 10.3376 22.2289 7.5 13.5 7.5C6.51688 7.5 1.94159 7.5 0.500002 7.5"
            stroke="var(--color-amber-300)"
          />
        </svg>
        <svg
          aria-hidden="true"
          className="-scale-x-100 absolute top-0 right-0 hidden translate-x-[80%] sm:block"
          fill="none"
          height="28"
          viewBox="0 0 55 28"
          width="55"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M37.7564 27.5141L54.5397 27.5141L54.5397 1.71661e-05L0.49993 1.24418e-05L0.499929 7.10423L13.5536 7.10423C22.2825 7.10423 24.187 9.85171 28.0753 18.6829C31.186 25.7479 35.8255 27.5141 37.7564 27.5141Z"
            fill="var(--color-amber-100)"
          />
          <path
            d="M54.5 27.5L37.5 27.5C35.5691 27.5 31.1463 26.2338 28.0356 19.1688C24.1473 10.3376 22.2289 7.5 13.5 7.5C6.51688 7.5 1.94159 7.5 0.500002 7.5"
            stroke="var(--color-amber-300)"
          />
        </svg>
        <span className="relative translate-y-px">
          You are in a test environment
        </span>
      </div>
    </aside>
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
