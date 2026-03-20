import { createFileRoute } from "@tanstack/react-router";
import { WebhooksPage } from "@/app/webhooks";

export const Route = createFileRoute("/_app/webhooks/")({
  component: WebhooksPage,
});
