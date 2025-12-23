import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/organizations/_active/members")({
  component: MembersLayout,
});

function MembersLayout() {
  return <div>Members</div>;
}
