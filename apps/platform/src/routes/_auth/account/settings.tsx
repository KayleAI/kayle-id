import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/account/settings")({
  component: AccountSettingsLayout,
});

function AccountSettingsLayout() {
  return <div>Account Settings</div>;
}
