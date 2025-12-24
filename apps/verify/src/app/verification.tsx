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
