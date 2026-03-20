import { Layout } from "@kayleai/ui/layout";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <Layout className="lg:rounded-[1.75rem]! lg:border-neutral-200/80! lg:bg-white/92! lg:shadow-[0_24px_80px_-48px_rgba(15,23,42,0.16)]! lg:backdrop-blur-xl!">
      <Outlet />
    </Layout>
  );
}
