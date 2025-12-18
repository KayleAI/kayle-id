import { useAuth } from "@kayle-id/auth/client/provider";
import { Layout } from "@kayleai/ui/layout";
import { Logo } from "@kayleai/ui/logo";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <Layout>
        <div className="flex h-full flex-col items-center justify-center">
          <Logo className="text-neutral-950" variant="default" />

          <div className="relative">
            <div className="size-12 rounded-full border-2 border-neutral-200" />
            <div className="absolute inset-0 size-12 animate-spin rounded-full border-2 border-transparent border-t-neutral-900 border-r-neutral-900" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-2 rounded-full bg-neutral-900" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate search={{ email: undefined }} to="/sign-in" />;
  }

  return <Outlet />;
}
