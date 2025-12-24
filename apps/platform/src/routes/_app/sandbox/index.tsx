import { createFileRoute } from "@tanstack/react-router";
import Sandbox from "@/app/sandbox";
import { AppHeading } from "@/components/app-heading";

export const Route = createFileRoute("/_app/sandbox/")({
  component: SandboxLayout,
});

function SandboxLayout() {
  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 grow flex-col">
      <AppHeading
        description="Test the Kayle ID API with a test API key"
        title="API Sandbox"
      />
      <hr className="my-8" />
      <Sandbox />
    </div>
  );
}
