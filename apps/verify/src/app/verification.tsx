import { Layout } from "@kayleai/ui/layout";
import { useLoaderData } from "@tanstack/react-router";
import { SessionApp } from "./app";
import { SessionEnvironment } from "./environment";
import { SessionError } from "./error";
import { SessionLoader } from "./loader";
import { SessionProvider } from "./session-provider";

export function VerificationApp() {
  const { sessionId } = useLoaderData({
    from: "/$",
  });

  return (
    <Layout className="lg:rounded-[1.75rem]! lg:border-neutral-200/80! lg:bg-white/94! lg:shadow-[0_24px_80px_-48px_rgba(15,23,42,0.16)]! lg:backdrop-blur-xl!">
      <SessionProvider sessionId={sessionId}>
        <SessionApp />
        <SessionError />
        <SessionLoader />
        <SessionEnvironment sessionId={sessionId} />
      </SessionProvider>
    </Layout>
  );
}
