import { useAuth } from "@kayle-id/auth/client/provider";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { SignIn } from "@/auth/sign-in";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignInLayout,
});

function SignInLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return <Loading />;
  }

  if (status === "authenticated") {
    return <Navigate to="/dashboard" />;
  }

  return <SignIn />;
}
