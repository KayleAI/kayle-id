import { createFileRoute } from "@tanstack/react-router";
import { SignIn } from "@/auth/sign-in";

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignIn,
});
