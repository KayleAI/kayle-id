import type { ApiKey } from "@kayle-id/auth/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysTable, CreateApiKey } from "@/app/api-keys";
import { AppHeading } from "@/components/app-heading";
import InfoCard from "@/components/info";
import { Loading } from "@/components/loading";

export const Route = createFileRoute("/_app/api-keys/")({
  component: ApiKeysLayout,
});

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

function ApiKeysLayout() {
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
        colour="red"
        header={{
          title: "Error",
          description: "Failed to load API keys",
        }}
        message={{
          title: error?.name || data?.error?.code || "Failed to load API keys",
          description:
            error?.message || data?.error?.message || "Failed to load API keys",
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 grow flex-col">
      <AppHeading
        button={<CreateApiKey />}
        description="Manage your API keys"
        title="API Keys"
      />
      <hr className="my-8" />
      <ApiKeysTable apiKeys={data?.data ?? []} />
    </div>
  );
}
