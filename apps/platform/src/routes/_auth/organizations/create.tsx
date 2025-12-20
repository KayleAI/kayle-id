import { useAuth } from "@kayle-id/auth/client/provider";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CreateOrganization } from "@/auth/organizations/create";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_auth/organizations/create")({
  component: CreateOrganizationLayout,
});

function CreateOrganizationLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return <Loading />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/sign-in" />;
  }

  return <CreateOrganization />;
}
