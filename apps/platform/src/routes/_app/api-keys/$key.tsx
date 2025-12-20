import type { ApiKey } from "@kayle-id/auth/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ApiKeyComponent } from "@/app/api-keys/key";
import InfoCard from "@/components/info";
import { Loading } from "@/components/loading";

type ApiKeysResponse = {
  data: ApiKey[];
  error: {
    code: string;
    message: string;
    hint?: string;
    docs?: string;
  } | null;
  pagination: {
    limit: number;
    has_more: boolean;
    next_cursor: string | null;
  };
};

async function fetchApiKeys(): Promise<ApiKeysResponse> {
  const response = await fetch("/api/auth/api-keys", {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error: {
        code: "HTTP_ERROR",
        message: `HTTP ${response.status}: ${response.statusText}`,
      },
      data: null,
      pagination: {
        limit: 10,
        has_more: false,
        next_cursor: null,
      },
    }))) as ApiKeysResponse;
    return errorData;
  }

  return response.json() as Promise<ApiKeysResponse>;
}

export const Route = createFileRoute("/_app/api-keys/$key")({
  component: ApiKeyLayout,
});

function ApiKeyLayout() {
  const { key } = Route.useParams();
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ["api-keys"],
    queryFn: fetchApiKeys,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0">
        <Loading layout />
      </div>
    );
  }

  if (isError || data?.error) {
    return (
      <InfoCard
        buttons={{
          primary: {
            label: "Go back",
            href: "/api-keys",
          },
        }}
        colour="red"
        header={{
          title: "Error",
          description: "Failed to load API key",
        }}
        message={{
          title: error?.name || data?.error?.code || "Failed to load API key",
          description:
            error?.message || data?.error?.message || "Failed to load API key",
        }}
      />
    );
  }

  const apiKey = data?.data?.find((k) => k.id === key);

  if (!apiKey) {
    return (
      <InfoCard
        buttons={{
          primary: {
            label: "Go back",
            href: "/api-keys",
          },
        }}
        colour="red"
        header={{
          title: "Not Found",
          description: "API key not found",
        }}
        message={{
          title: "API key not found",
          description:
            "The API key you're looking for doesn't exist or has been deleted.",
        }}
      />
    );
  }

  return <ApiKeyComponent apiKey={apiKey} />;
}
