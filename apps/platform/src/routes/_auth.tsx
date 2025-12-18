import { useAuth } from "@kayle-id/auth/client/provider";
import { Layout } from "@kayleai/ui/layout";
import { Logo } from "@kayleai/ui/logo";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <Layout>
        <div className="flex h-full flex-col items-center justify-center">
          <Logo className="text-neutral-950" variant="default" />
        </div>
      </Layout>
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/dashboard" />;
  }

  return <Outlet />;
}
