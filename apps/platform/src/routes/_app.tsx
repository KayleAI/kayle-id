import { useAuth } from "@kayle-id/auth/client/provider";
import { Toaster } from "@kayleai/ui/sonner";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_app")({
  component: AppLayoutRoute,
});

function AppLayoutRoute() {
  const { status, activeOrganization } = useAuth();

  if (status === "loading") {
    return <Loading layout />;
  }

  if (status === "unauthenticated") {
    return <Navigate search={{ email: undefined }} to="/sign-in" />;
  }

  if (!activeOrganization) {
    return <Navigate to="/organizations/select" />;
  }

  return (
    <AppLayout>
      <Outlet />
      <Toaster />
    </AppLayout>
  );
}
