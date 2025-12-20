import { createFileRoute } from "@tanstack/react-router";
import { ApiKey } from "@/app/api-keys/key";

export const Route = createFileRoute("/_app/api-keys/$key")({
  component: ApiKeyLayout,
  loader: ({ params }) => {
    console.log(`Getting key ${params.key}`);

    const key = { id: "123", name: "Test Key" };

    return { key };
  },
});

function ApiKeyLayout() {
  const { key } = Route.useLoaderData();

  return <ApiKey apiKey={key} />;
}
