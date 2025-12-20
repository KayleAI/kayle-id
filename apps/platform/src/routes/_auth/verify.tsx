import { useAuth } from "@kayle-id/auth/client/provider";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { Verify } from "@/auth/verify";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_auth/verify")({
  component: VerifyLayout,
  validateSearch: z.object({
    email: z.string().email().optional(),
  }),
});

function VerifyLayout() {
  const { status } = useAuth();

  if (status === "loading") {
    return <Loading />;
  }

  if (status === "authenticated") {
    return <Navigate to="/dashboard" />;
  }

  return <Verify />;
}
