import { Layout } from "@kayleai/ui/layout";
import { SidebarInset, SidebarProvider } from "@kayleai/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Layout
          className="md:-ml-2! md:rounded-lg! md:border md:bg-background! md:shadow-none! md:ring-0!"
          notCenter
        >
          {children}
        </Layout>
      </SidebarInset>
    </SidebarProvider>
  );
}
