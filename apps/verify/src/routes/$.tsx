import { sessionIdSchema } from "@api/shared/validation";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { VerificationApp } from "@/app/verification";

export const Route = createFileRoute("/$")({
  component: VerificationApp,
  loader: ({ params }) => {
    const sessionId = params._splat;

    if (!sessionId) {
      throw notFound();
    }

    // validate the session id
    if (!sessionIdSchema.safeParse(sessionId).success) {
      throw notFound({
        data: {
          type: "invalid_session_id",
        },
      });
    }

    return { sessionId };
  },
  head: () => ({
    meta: [
      {
        title: "Kayle ID Verification",
        description: "Verify your identity with Kayle ID",
      },
    ],
  }),
});
