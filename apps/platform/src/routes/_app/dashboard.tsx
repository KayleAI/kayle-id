import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/app/dashboard";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});
