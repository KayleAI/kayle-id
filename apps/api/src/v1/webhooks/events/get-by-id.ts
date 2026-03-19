import { OpenAPIHono } from "@hono/zod-openapi";
import { getWebhookEvent } from "@/openapi/v1/webhooks/events/get-by-id";
import { getWebhookEventForOrganization } from "./utils";

const getEventById = new OpenAPIHono<{
  Bindings: CloudflareBindings;
  Variables: { organizationId: string };
}>();

getEventById.openapi(getWebhookEvent, async (c) => {
  const organizationId = c.get("organizationId");
  const params = c.req.valid("param");
  const event = await getWebhookEventForOrganization({
    eventId: params.event_id,
    organizationId,
  });

  if (!event) {
    return c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "Webhook event not found.",
          hint: "The webhook event with the given ID was not found.",
          docs: "https://kayle.id/docs/api/webhooks/events#get-by-id",
        },
      },
      404
    );
  }

  return c.json(
    {
      data: event,
      error: null,
    },
    200
  );
});

export { getEventById };
