import { Layout } from "@kayleai/ui/layout";
import { Logo } from "@kayleai/ui/logo";

export function Loading() {
  return (
    <Layout>
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <Logo className="text-foreground" variant="default" />

        <div className="relative">
          <div className="size-12 rounded-full border-2 border-border" />
          <div className="absolute inset-0 size-12 animate-spin rounded-full border-2 border-t-foreground border-r-foreground" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-2 rounded-full bg-foreground" />
          </div>
        </div>
      </div>
    </Layout>
  );
}
