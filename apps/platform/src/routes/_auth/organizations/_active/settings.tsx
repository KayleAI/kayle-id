import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/organizations/_active/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return <div>Organization Settings</div>;
}
