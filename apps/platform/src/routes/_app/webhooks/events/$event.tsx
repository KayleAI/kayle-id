import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WebhookEventPage } from "@/app/webhooks";

const webhooksSearchSchema = z.object({
  tab: z.enum(["endpoints", "events"]).optional(),
});

export const Route = createFileRoute("/_app/webhooks/events/$event")({
  component: WebhookEventRoute,
  validateSearch: webhooksSearchSchema,
});

function WebhookEventRoute() {
  const { event } = Route.useParams();

  return <WebhookEventPage eventId={event} />;
}
