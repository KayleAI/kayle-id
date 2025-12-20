import { useAuth } from "@kayle-id/auth/client/provider";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { SelectOrganizations } from "@/auth/organizations/select";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_auth/organizations/select")({
  component: SelectOrganizationLayout,
});

function SelectOrganizationLayout() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <Loading />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/sign-in" />;
  }

  if (!user?.organizations.length) {
    return <Navigate to="/organizations/create" />;
  }

  return <SelectOrganizations />;
}
