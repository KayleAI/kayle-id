import { useAuth } from "@kayle-id/auth/client/provider";
import { Layout } from "@kayleai/ui/layout";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { status, session } = useAuth();

  if (status === "loading") {
    return <Loading layout />;
  }

  if (status === "unauthenticated") {
    return <Navigate search={{ email: undefined }} to="/sign-in" />;
  }

  if (!session?.activeOrganization) {
    return <Navigate to="/organizations/select" />;
  }

  return (
    <Layout notCenter>
      <Outlet />
    </Layout>
  );
}
