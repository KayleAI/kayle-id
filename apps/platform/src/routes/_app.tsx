import { useAuth } from "@kayle-id/auth/client/provider";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return <Loading />;
  }

  if (status === "unauthenticated") {
    return <Navigate search={{ email: undefined }} to="/sign-in" />;
  }

  return <Outlet />;
}
