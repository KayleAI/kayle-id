import { client } from "@kayle-id/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { useSingleEffect } from "react-haiku";

export const Route = createFileRoute("/_auth/sign-out")({
  component: SignOutPage,
});

function SignOutPage() {
  useSingleEffect(() => {
    client.signOut().then(() => {
      window.location.href = "/";
    });
  });

  return <p>Signing you out...</p>;
}
