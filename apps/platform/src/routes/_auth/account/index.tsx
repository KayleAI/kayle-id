import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/account/")({
  component: Account,
});

function Account() {
  return <div>Account</div>;
}
