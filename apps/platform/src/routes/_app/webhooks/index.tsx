import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { WebhooksPage } from "@/app/webhooks";

const webhooksSearchSchema = z.object({
  tab: z.enum(["endpoints", "events"]).optional(),
});

export const Route = createFileRoute("/_app/webhooks/")({
  component: WebhooksRoute,
  validateSearch: webhooksSearchSchema,
});

function WebhooksRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  return (
    <WebhooksPage
      activeTab={search.tab ?? "endpoints"}
      onActiveTabChange={(tab) => {
        navigate({
          to: "/webhooks",
          search: {
            tab: tab === "events" ? "events" : undefined,
          },
        });
      }}
    />
  );
}
