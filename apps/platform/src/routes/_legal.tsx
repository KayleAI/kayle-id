import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export const Route = createFileRoute("/_legal")({
  component: MarketingLayout,
});

function MarketingLayout() {
  return (
    <div>
      <Header />
      <main className="min-h-[calc(100vh)] pt-16">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
