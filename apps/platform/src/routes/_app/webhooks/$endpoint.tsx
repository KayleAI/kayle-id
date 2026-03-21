import { createFileRoute } from "@tanstack/react-router";
import { WebhookEndpointPage } from "@/app/webhooks";

export const Route = createFileRoute("/_app/webhooks/$endpoint")({
  component: WebhookEndpointRoute,
});

function WebhookEndpointRoute() {
  const { endpoint } = Route.useParams();

  return <WebhookEndpointPage endpointId={endpoint} />;
}
