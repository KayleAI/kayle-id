import { useAuth } from "@kayle-id/auth/client/provider";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return <Loading />;
  }

  if (status === "authenticated") {
    return <Navigate to="/dashboard" />;
  }

  return <Outlet />;
}
