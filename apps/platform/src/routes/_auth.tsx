import { Layout } from "@kayleai/ui/layout";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
