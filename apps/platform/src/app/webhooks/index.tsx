import { useAuth } from "@kayle-id/auth/client/provider";
import { SUPPORTED_WEBHOOK_EVENT_TYPES } from "@kayle-id/config/webhook-events";
import { Alert, AlertDescription, AlertTitle } from "@kayleai/ui/alert";
import { Badge } from "@kayleai/ui/badge";
import { Button } from "@kayleai/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@kayleai/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@kayleai/ui/dialog";
import { Input } from "@kayleai/ui/input";
import { Label } from "@kayleai/ui/label";
import { Separator } from "@kayleai/ui/separator";
import { Switch } from "@kayleai/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kayleai/ui/table";
import { Textarea } from "@kayleai/ui/textarea";
import { cn } from "@kayleai/ui/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  EyeIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeading } from "@/components/app-heading";
import { Loading } from "@/components/loading";
import { formatDate } from "@/utils/format-date";
import { useCopyToClipboard } from "@/utils/use-copy";
import {
  createWebhookEndpoint,
  createWebhookKey,
  type DeliveryStatus,
  deactivateWebhookKey,
  type Environment,
  listWebhookDeliveries,
  listWebhookEndpoints,
  listWebhookEvents,
  listWebhookKeys,
  parseJwkInput,
  replayWebhookEvent,
  retryWebhookDelivery,
  revealWebhookSigningSecret,
  rotateWebhookSigningSecret,
  updateWebhookEndpoint,
  type WebhookDelivery,
  type WebhookEncryptionKey,
  type WebhookEndpoint,
  type WebhookEvent,
  type WebhookSigningSecretResult,
} from "./api";

const DEFAULT_EVENT_TYPE = SUPPORTED_WEBHOOK_EVENT_TYPES[0];

type WebhooksTab = "deliveries" | "endpoints" | "events";
type EnvironmentFilter = Environment | "all";
type SecretDialogState =
  | {
      endpointId: string;
      open: true;
      secret: string;
      title: string;
    }
  | {
      endpointId: null;
      open: false;
      secret: "";
      title: "";
    };

const INITIAL_SECRET_DIALOG_STATE: SecretDialogState = {
  endpointId: null,
  open: false,
  secret: "",
  title: "",
};

const tabOptions: Array<{
  description: string;
  value: WebhooksTab;
  label: string;
}> = [
  {
    value: "endpoints",
    label: "Endpoints",
    description: "Configure webhook destinations and signing secrets.",
  },
  {
    value: "events",
    label: "Events",
    description: "Inspect emitted webhook events and replay them.",
  },
  {
    value: "deliveries",
    label: "Deliveries",
    description: "Review delivery attempts and retry them.",
  },
];

const environmentOptions: Array<{
  label: string;
  value: EnvironmentFilter;
}> = [
  { label: "All environments", value: "all" },
  { label: "Live", value: "live" },
  { label: "Test", value: "test" },
];

function formatOptionalDate(dateString: string | null): string {
  return dateString ? formatDate(dateString) : "Never";
}

function summarizeDeliveryStatuses(
  deliveries: WebhookEvent["deliveries"]
): string {
  if (deliveries.length === 0) {
    return "No deliveries";
  }

  const counts = new Map<DeliveryStatus, number>();

  for (const delivery of deliveries) {
    counts.set(delivery.status, (counts.get(delivery.status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");
}

function getEnvironmentBadgeClass(environment: Environment): string {
  return environment === "live"
    ? "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
    : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400";
}

function getStatusBadgeClass(
  status: DeliveryStatus | "active" | "inactive"
): string {
  if (status === "active" || status === "succeeded") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400";
  }

  if (status === "pending" || status === "delivering") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400";
  }

  return "border-red-500/20 bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400";
}

function EnvironmentBadge({ environment }: { environment: Environment }) {
  return (
    <Badge
      className={cn(
        "px-2.5 py-1 text-xs",
        getEnvironmentBadgeClass(environment)
      )}
      variant="outline"
    >
      {environment}
    </Badge>
  );
}

function StatusBadge({
  status,
}: {
  status: DeliveryStatus | "active" | "inactive";
}) {
  return (
    <Badge
      className={cn("px-2.5 py-1 text-xs", getStatusBadgeClass(status))}
      variant="outline"
    >
      {status.replace("_", " ")}
    </Badge>
  );
}

function SectionMessage({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed">
      <div className="max-w-md space-y-2 px-6 py-10 text-center">
        <h3 className="font-medium text-lg">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}

type AsyncToastMessages = {
  error: string;
  loading: string;
  success: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function showAsyncToast(
  promise: Promise<void>,
  messages: AsyncToastMessages
): void {
  toast.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: (error) => getErrorMessage(error, messages.error),
  });
}

function QueryErrorAlert({
  error,
  fallback,
  title,
}: {
  error: unknown;
  fallback: string;
  title: string;
}) {
  if (!error) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{getErrorMessage(error, fallback)}</AlertDescription>
    </Alert>
  );
}

function LoadingState({ minHeight = "min-h-56" }: { minHeight?: string }) {
  return (
    <div className={cn("flex items-center justify-center", minHeight)}>
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function WebhooksControls({
  activeTab,
  environmentFilter,
  onEnvironmentChange,
  onTabChange,
}: {
  activeTab: WebhooksTab;
  environmentFilter: EnvironmentFilter;
  onEnvironmentChange: (value: EnvironmentFilter) => void;
  onTabChange: (value: WebhooksTab) => void;
}) {
  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Control surface</CardTitle>
          <CardDescription>
            Switch between configuration and operational views without leaving
            the page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {tabOptions.map((tab) => (
            <Button
              className="justify-start"
              key={tab.value}
              onClick={() => onTabChange(tab.value)}
              type="button"
              variant={activeTab === tab.value ? "default" : "outline"}
            >
              {tab.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Environment</CardTitle>
          <CardDescription>
            Filter the current view by environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {environmentOptions.map((option) => (
            <Button
              key={option.value}
              onClick={() => onEnvironmentChange(option.value)}
              type="button"
              variant={
                environmentFilter === option.value ? "default" : "outline"
              }
            >
              {option.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function EndpointListCard({
  endpoints,
  onSelectEndpoint,
  selectedEndpointId,
}: {
  endpoints: WebhookEndpoint[];
  onSelectEndpoint: (endpointId: string) => void;
  selectedEndpointId: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Endpoints</CardTitle>
        <CardDescription>
          Each endpoint owns its own signing secret and encryption keys.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {endpoints.length === 0 ? (
          <SectionMessage
            description="Create your first webhook endpoint to start receiving verification events."
            title="No webhook endpoints yet"
          />
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subscriptions</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((endpoint) => (
                  <TableRow
                    className={cn(
                      endpoint.id === selectedEndpointId
                        ? "bg-muted/40"
                        : undefined
                    )}
                    key={endpoint.id}
                  >
                    <TableCell className="min-w-72">
                      <div className="space-y-1">
                        <div className="font-medium">{endpoint.url}</div>
                        <div className="font-mono text-muted-foreground text-xs">
                          {endpoint.id}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <EnvironmentBadge environment={endpoint.environment} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={endpoint.enabled ? "active" : "inactive"}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {endpoint.subscribed_event_types.join(", ") || "None"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">
                      {formatDate(endpoint.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => onSelectEndpoint(endpoint.id)}
                        size="sm"
                        type="button"
                        variant={
                          endpoint.id === selectedEndpointId
                            ? "default"
                            : "outline"
                        }
                      >
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EndpointDetailsCard({
  endpoint,
  endpointEnabled,
  endpointSubscribed,
  endpointUrl,
  isDirty,
  isRevealing,
  isRotating,
  isSaving,
  onEndpointEnabledChange,
  onEndpointSubscribedChange,
  onEndpointUrlChange,
  onRevealSecret,
  onRotateSecret,
  onSaveEndpoint,
  showMissingKeyAlert,
}: {
  endpoint: WebhookEndpoint;
  endpointEnabled: boolean;
  endpointSubscribed: boolean;
  endpointUrl: string;
  isDirty: boolean;
  isRevealing: boolean;
  isRotating: boolean;
  isSaving: boolean;
  onEndpointEnabledChange: (enabled: boolean) => void;
  onEndpointSubscribedChange: (enabled: boolean) => void;
  onEndpointUrlChange: (value: string) => void;
  onRevealSecret: () => Promise<void>;
  onRotateSecret: () => Promise<void>;
  onSaveEndpoint: () => Promise<void>;
  showMissingKeyAlert: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>Endpoint details</CardTitle>
          <EnvironmentBadge environment={endpoint.environment} />
          <StatusBadge status={endpoint.enabled ? "active" : "inactive"} />
        </div>
        <CardDescription>
          Update the destination, enablement, and subscribed events for{" "}
          <span className="font-mono">{endpoint.id}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {showMissingKeyAlert ? (
          <Alert>
            <ShieldAlertIcon className="size-4" />
            <AlertTitle>No active public key</AlertTitle>
            <AlertDescription>
              New deliveries to this endpoint will fail until an active
              encryption key is added.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="webhook-url">Destination URL</Label>
          <Input
            id="webhook-url"
            onChange={(event) => onEndpointUrlChange(event.target.value)}
            value={endpointUrl}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-6">
          <div className="space-y-0.5">
            <Label htmlFor="endpoint-enabled">Enabled</Label>
            <p className="text-muted-foreground text-sm">
              Disabled endpoints stop receiving new deliveries.
            </p>
          </div>
          <Switch
            checked={endpointEnabled}
            id="endpoint-enabled"
            onCheckedChange={onEndpointEnabledChange}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-6">
          <div className="space-y-0.5">
            <Label htmlFor="subscription-default">{DEFAULT_EVENT_TYPE}</Label>
            <p className="text-muted-foreground text-sm">
              Subscribe this endpoint to completed verification attempts.
            </p>
          </div>
          <Switch
            checked={endpointSubscribed}
            id="subscription-default"
            onCheckedChange={onEndpointSubscribedChange}
          />
        </div>

        <Separator />

        <div className="flex flex-wrap gap-3">
          <Button
            disabled={!isDirty || isSaving}
            onClick={() =>
              showAsyncToast(onSaveEndpoint(), {
                loading: "Saving webhook endpoint...",
                success: "Webhook endpoint updated",
                error: "Failed to update webhook endpoint",
              })
            }
            type="button"
          >
            {isSaving ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            Save changes
          </Button>
          <Button
            disabled={isRevealing}
            onClick={() =>
              showAsyncToast(onRevealSecret(), {
                loading: "Revealing signing secret...",
                success: "Signing secret revealed",
                error: "Failed to reveal signing secret",
              })
            }
            type="button"
            variant="outline"
          >
            <EyeIcon className="mr-2 size-4" />
            Reveal signing secret
          </Button>
          <Button
            disabled={isRotating}
            onClick={() =>
              showAsyncToast(onRotateSecret(), {
                loading: "Rotating signing secret...",
                success: "Signing secret rotated",
                error: "Failed to rotate signing secret",
              })
            }
            type="button"
            variant="outline"
          >
            <RefreshCwIcon className="mr-2 size-4" />
            Rotate signing secret
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EndpointKeysCard({
  endpointId,
  error,
  isDeactivating,
  isLoading,
  keys,
  onCreateKey,
  onDeactivateKey,
}: {
  endpointId: string;
  error: unknown;
  isDeactivating: boolean;
  isLoading: boolean;
  keys: WebhookEncryptionKey[];
  onCreateKey: (input: {
    endpointId: string;
    jwk: JsonWebKey;
    keyId: string;
  }) => Promise<void>;
  onDeactivateKey: (keyId: string) => Promise<void>;
}) {
  let content: ReactNode;

  if (isLoading) {
    content = <LoadingState minHeight="min-h-32" />;
  } else if (keys.length === 0) {
    content = (
      <SectionMessage
        description="Add a public JWK to encrypt outbound payloads for this endpoint."
        title="No public keys yet"
      />
    );
  } else {
    content = (
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium">{key.key_id}</div>
                    <div className="font-mono text-muted-foreground text-xs">
                      {key.algorithm} · {key.id}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={key.is_active ? "active" : "inactive"} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm tabular-nums">
                  {formatDate(key.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    disabled={!key.is_active || isDeactivating}
                    onClick={() =>
                      showAsyncToast(onDeactivateKey(key.id), {
                        loading: "Deactivating key...",
                        success: "Key deactivated",
                        error: "Failed to deactivate key",
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Deactivate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Public keys</CardTitle>
            <CardDescription>
              Keys are scoped to this endpoint and encrypt outbound payloads.
            </CardDescription>
          </div>
          <CreateKeyDialog endpointId={endpointId} onSubmit={onCreateKey} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <QueryErrorAlert
          error={error}
          fallback="Webhook keys could not be loaded."
          title="Failed to load keys"
        />
        {content}
      </CardContent>
    </Card>
  );
}

function EndpointsTabContent({
  isDeactivatingKey,
  endpointEnabled,
  endpointError,
  endpointSubscribed,
  endpointUrl,
  endpoints,
  isEndpointDirty,
  isRevealingSecret,
  isRotatingSecret,
  isSavingEndpoint,
  keys,
  keysError,
  keysLoading,
  onCreateKey,
  onDeactivateKey,
  onEndpointEnabledChange,
  onEndpointSubscribedChange,
  onEndpointUrlChange,
  onRevealSecret,
  onRotateSecret,
  onSaveEndpoint,
  onSelectEndpoint,
  selectedEndpoint,
  selectedEndpointId,
  showMissingKeyAlert,
}: {
  isDeactivatingKey: boolean;
  endpointEnabled: boolean;
  endpointError: unknown;
  endpointSubscribed: boolean;
  endpointUrl: string;
  endpoints: WebhookEndpoint[];
  isEndpointDirty: boolean;
  isRevealingSecret: boolean;
  isRotatingSecret: boolean;
  isSavingEndpoint: boolean;
  keys: WebhookEncryptionKey[];
  keysError: unknown;
  keysLoading: boolean;
  onCreateKey: (input: {
    endpointId: string;
    jwk: JsonWebKey;
    keyId: string;
  }) => Promise<void>;
  onDeactivateKey: (keyId: string) => Promise<void>;
  onEndpointEnabledChange: (enabled: boolean) => void;
  onEndpointSubscribedChange: (enabled: boolean) => void;
  onEndpointUrlChange: (value: string) => void;
  onRevealSecret: (endpointId: string) => Promise<void>;
  onRotateSecret: (endpointId: string) => Promise<void>;
  onSaveEndpoint: () => Promise<void>;
  onSelectEndpoint: (endpointId: string) => void;
  selectedEndpoint: WebhookEndpoint | null;
  selectedEndpointId: string | null;
  showMissingKeyAlert: boolean;
}) {
  return (
    <div className="space-y-6">
      <QueryErrorAlert
        error={endpointError}
        fallback="Webhook endpoints could not be loaded."
        title="Failed to load webhook endpoints"
      />

      <EndpointListCard
        endpoints={endpoints}
        onSelectEndpoint={onSelectEndpoint}
        selectedEndpointId={selectedEndpointId}
      />

      {selectedEndpoint ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <EndpointDetailsCard
            endpoint={selectedEndpoint}
            endpointEnabled={endpointEnabled}
            endpointSubscribed={endpointSubscribed}
            endpointUrl={endpointUrl}
            isDirty={isEndpointDirty}
            isRevealing={isRevealingSecret}
            isRotating={isRotatingSecret}
            isSaving={isSavingEndpoint}
            onEndpointEnabledChange={onEndpointEnabledChange}
            onEndpointSubscribedChange={onEndpointSubscribedChange}
            onEndpointUrlChange={onEndpointUrlChange}
            onRevealSecret={() => onRevealSecret(selectedEndpoint.id)}
            onRotateSecret={() => onRotateSecret(selectedEndpoint.id)}
            onSaveEndpoint={onSaveEndpoint}
            showMissingKeyAlert={showMissingKeyAlert}
          />
          <EndpointKeysCard
            endpointId={selectedEndpoint.id}
            error={keysError}
            isDeactivating={isDeactivatingKey}
            isLoading={keysLoading}
            keys={keys}
            onCreateKey={onCreateKey}
            onDeactivateKey={onDeactivateKey}
          />
        </div>
      ) : null}
    </div>
  );
}

function EventsTabContent({
  error,
  events,
  isLoading,
  isReplaying,
  onReplayEvent,
}: {
  error: unknown;
  events: WebhookEvent[];
  isLoading: boolean;
  isReplaying: boolean;
  onReplayEvent: (eventId: string) => Promise<void>;
}) {
  let content: ReactNode;

  if (isLoading) {
    content = <LoadingState />;
  } else if (events.length === 0) {
    content = (
      <SectionMessage
        description="Webhook events will appear here once a subscribed endpoint receives verification activity."
        title="No webhook events yet"
      />
    );
  } else {
    content = (
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Deliveries</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="min-w-72">
                  <div className="space-y-1">
                    <div className="font-medium">{event.type}</div>
                    <div className="font-mono text-muted-foreground text-xs">
                      {event.id}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <EnvironmentBadge environment={event.environment} />
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="text-sm">{event.trigger_type}</div>
                    <div className="font-mono text-muted-foreground text-xs">
                      {event.trigger_id}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {summarizeDeliveryStatuses(event.deliveries)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm tabular-nums">
                  {formatDate(event.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    disabled={isReplaying}
                    onClick={() =>
                      showAsyncToast(onReplayEvent(event.id), {
                        loading: "Replaying event...",
                        success: "Webhook event replayed",
                        error: "Failed to replay event",
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Replay
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook events</CardTitle>
        <CardDescription>
          Review emitted events and replay them when downstream systems need
          another delivery attempt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <QueryErrorAlert
          error={error}
          fallback="Webhook events could not be loaded."
          title="Failed to load webhook events"
        />
        {content}
      </CardContent>
    </Card>
  );
}

function DeliveriesTabContent({
  deliveries,
  error,
  isLoading,
  isRetrying,
  onRetryDelivery,
}: {
  deliveries: WebhookDelivery[];
  error: unknown;
  isLoading: boolean;
  isRetrying: boolean;
  onRetryDelivery: (deliveryId: string) => Promise<void>;
}) {
  let content: ReactNode;

  if (isLoading) {
    content = <LoadingState />;
  } else if (deliveries.length === 0) {
    content = (
      <SectionMessage
        description="Delivery attempts will appear here after webhook events are queued for an endpoint."
        title="No deliveries yet"
      />
    );
  } else {
    content = (
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Delivery</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Last response</TableHead>
              <TableHead>Last attempt</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-mono text-sm">{delivery.id}</div>
                    <div className="font-mono text-muted-foreground text-xs">
                      {delivery.webhook_encryption_key_id ?? "No key"}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={delivery.status} />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {delivery.event_id}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {delivery.webhook_endpoint_id}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {delivery.attempt_count}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {delivery.last_status_code ?? "n/a"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm tabular-nums">
                  {formatOptionalDate(delivery.last_attempt_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    disabled={isRetrying}
                    onClick={() =>
                      showAsyncToast(onRetryDelivery(delivery.id), {
                        loading: "Retrying delivery...",
                        success: "Delivery requeued",
                        error: "Failed to retry delivery",
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhook deliveries</CardTitle>
        <CardDescription>
          Inspect individual delivery attempts and manually retry them when
          needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <QueryErrorAlert
          error={error}
          fallback="Webhook deliveries could not be loaded."
          title="Failed to load deliveries"
        />
        {content}
      </CardContent>
    </Card>
  );
}

export function WebhooksPage() {
  const { activeOrganization } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<WebhooksTab>("endpoints");
  const [environmentFilter, setEnvironmentFilter] =
    useState<EnvironmentFilter>("all");
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(
    null
  );
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpointEnabled, setEndpointEnabled] = useState(true);
  const [endpointSubscribed, setEndpointSubscribed] = useState(true);
  const [secretDialog, setSecretDialog] = useState<SecretDialogState>(
    INITIAL_SECRET_DIALOG_STATE
  );

  const normalizedEnvironment =
    environmentFilter === "all" ? undefined : environmentFilter;

  const endpointsQuery = useQuery({
    queryKey: ["webhooks", "endpoints", normalizedEnvironment],
    queryFn: () =>
      listWebhookEndpoints({
        environment: normalizedEnvironment,
        limit: 50,
      }),
  });

  const endpoints = endpointsQuery.data?.data ?? [];
  const selectedEndpoint =
    endpoints.find((endpoint) => endpoint.id === selectedEndpointId) ?? null;

  const keysQuery = useQuery({
    enabled: Boolean(selectedEndpointId),
    queryKey: ["webhooks", "keys", selectedEndpointId],
    queryFn: () =>
      listWebhookKeys({
        endpointId: selectedEndpointId ?? "",
        limit: 50,
      }),
  });

  const eventsQuery = useQuery({
    queryKey: ["webhooks", "events", normalizedEnvironment],
    queryFn: () =>
      listWebhookEvents({
        environment: normalizedEnvironment,
        limit: 50,
      }),
  });

  const deliveriesQuery = useQuery({
    queryKey: ["webhooks", "deliveries", normalizedEnvironment],
    queryFn: () =>
      listWebhookDeliveries({
        environment: normalizedEnvironment,
        limit: 50,
      }),
  });

  useEffect(() => {
    if (endpoints.length === 0) {
      setSelectedEndpointId(null);
      return;
    }

    if (
      !(
        selectedEndpointId &&
        endpoints.some((endpoint) => endpoint.id === selectedEndpointId)
      )
    ) {
      setSelectedEndpointId(endpoints[0]?.id ?? null);
    }
  }, [endpoints, selectedEndpointId]);

  useEffect(() => {
    if (!selectedEndpoint) {
      setEndpointUrl("");
      setEndpointEnabled(true);
      setEndpointSubscribed(true);
      return;
    }

    setEndpointUrl(selectedEndpoint.url);
    setEndpointEnabled(selectedEndpoint.enabled);
    setEndpointSubscribed(
      selectedEndpoint.subscribed_event_types.includes(DEFAULT_EVENT_TYPE)
    );
  }, [selectedEndpoint]);

  const createEndpointMutation = useMutation({
    mutationFn: createWebhookEndpoint,
  });
  const updateEndpointMutation = useMutation({
    mutationFn: updateWebhookEndpoint,
  });
  const revealSecretMutation = useMutation({
    mutationFn: revealWebhookSigningSecret,
  });
  const rotateSecretMutation = useMutation({
    mutationFn: rotateWebhookSigningSecret,
  });
  const createKeyMutation = useMutation({
    mutationFn: createWebhookKey,
  });
  const deactivateKeyMutation = useMutation({
    mutationFn: deactivateWebhookKey,
  });
  const replayEventMutation = useMutation({
    mutationFn: replayWebhookEvent,
  });
  const retryDeliveryMutation = useMutation({
    mutationFn: retryWebhookDelivery,
  });

  const keys = keysQuery.data?.data ?? [];
  const events = eventsQuery.data?.data ?? [];
  const deliveries = deliveriesQuery.data?.data ?? [];

  const isEndpointDirty =
    selectedEndpoint !== null &&
    (selectedEndpoint.url !== endpointUrl ||
      selectedEndpoint.enabled !== endpointEnabled ||
      selectedEndpoint.subscribed_event_types.includes(DEFAULT_EVENT_TYPE) !==
        endpointSubscribed);
  const showMissingKeyAlert =
    selectedEndpoint !== null &&
    !keysQuery.isLoading &&
    keys.every((key) => !key.is_active);
  const activeTabDescription =
    tabOptions.find((tab) => tab.value === activeTab)?.description ?? "";

  function refreshWebhookQueries(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: ["webhooks"] });
  }

  function openSecretDialog({
    endpoint_id,
    signing_secret,
    title,
  }: WebhookSigningSecretResult & { title: string }) {
    setSecretDialog({
      endpointId: endpoint_id,
      open: true,
      secret: signing_secret,
      title,
    });
  }

  async function handleCreateEndpoint(input: {
    enabled: boolean;
    environment: Environment;
    subscribedEventTypes: string[];
    url: string;
  }): Promise<void> {
    const result = await createEndpointMutation.mutateAsync(input);
    await refreshWebhookQueries();
    setSelectedEndpointId(result.endpoint.id);
    setActiveTab("endpoints");
    openSecretDialog({
      endpoint_id: result.endpoint.id,
      signing_secret: result.signing_secret,
      title: "Webhook signing secret created",
    });
  }

  async function handleSaveEndpoint(): Promise<void> {
    if (!selectedEndpoint) {
      return;
    }

    if (!endpointUrl.trim()) {
      throw new Error("Webhook URL is required.");
    }

    await updateEndpointMutation.mutateAsync({
      endpointId: selectedEndpoint.id,
      url: endpointUrl.trim(),
      enabled: endpointEnabled,
      subscribedEventTypes: endpointSubscribed ? [DEFAULT_EVENT_TYPE] : [],
    });
    await refreshWebhookQueries();
  }

  async function handleRevealSecret(endpointId: string): Promise<void> {
    const result = await revealSecretMutation.mutateAsync(endpointId);
    openSecretDialog({
      ...result,
      title: "Current webhook signing secret",
    });
  }

  async function handleRotateSecret(endpointId: string): Promise<void> {
    const result = await rotateSecretMutation.mutateAsync(endpointId);
    await refreshWebhookQueries();
    openSecretDialog({
      ...result,
      title: "Webhook signing secret rotated",
    });
  }

  async function handleCreateKey(input: {
    endpointId: string;
    jwk: JsonWebKey;
    keyId: string;
  }): Promise<void> {
    await createKeyMutation.mutateAsync(input);
    await refreshWebhookQueries();
  }

  async function handleDeactivateKey(keyId: string): Promise<void> {
    await deactivateKeyMutation.mutateAsync(keyId);
    await refreshWebhookQueries();
  }

  async function handleReplayEvent(eventId: string): Promise<void> {
    await replayEventMutation.mutateAsync(eventId);
    await refreshWebhookQueries();
  }

  async function handleRetryDelivery(deliveryId: string): Promise<void> {
    await retryDeliveryMutation.mutateAsync(deliveryId);
    await refreshWebhookQueries();
  }

  if (endpointsQuery.isLoading && !endpointsQuery.data) {
    return (
      <div className="fixed inset-0">
        <Loading layout />
      </div>
    );
  }

  const tabContentByValue: Record<WebhooksTab, ReactNode> = {
    endpoints: (
      <EndpointsTabContent
        endpointEnabled={endpointEnabled}
        endpointError={endpointsQuery.error}
        endpointSubscribed={endpointSubscribed}
        endpoints={endpoints}
        endpointUrl={endpointUrl}
        isDeactivatingKey={deactivateKeyMutation.isPending}
        isEndpointDirty={isEndpointDirty}
        isRevealingSecret={revealSecretMutation.isPending}
        isRotatingSecret={rotateSecretMutation.isPending}
        isSavingEndpoint={updateEndpointMutation.isPending}
        keys={keys}
        keysError={keysQuery.error}
        keysLoading={keysQuery.isLoading}
        onCreateKey={handleCreateKey}
        onDeactivateKey={handleDeactivateKey}
        onEndpointEnabledChange={setEndpointEnabled}
        onEndpointSubscribedChange={setEndpointSubscribed}
        onEndpointUrlChange={setEndpointUrl}
        onRevealSecret={handleRevealSecret}
        onRotateSecret={handleRotateSecret}
        onSaveEndpoint={handleSaveEndpoint}
        onSelectEndpoint={setSelectedEndpointId}
        selectedEndpoint={selectedEndpoint}
        selectedEndpointId={selectedEndpointId}
        showMissingKeyAlert={showMissingKeyAlert}
      />
    ),
    events: (
      <EventsTabContent
        error={eventsQuery.error}
        events={events}
        isLoading={eventsQuery.isLoading}
        isReplaying={replayEventMutation.isPending}
        onReplayEvent={handleReplayEvent}
      />
    ),
    deliveries: (
      <DeliveriesTabContent
        deliveries={deliveries}
        error={deliveriesQuery.error}
        isLoading={deliveriesQuery.isLoading}
        isRetrying={retryDeliveryMutation.isPending}
        onRetryDelivery={handleRetryDelivery}
      />
    ),
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 grow flex-col">
      <AppHeading
        button={<CreateEndpointDialog onSubmit={handleCreateEndpoint} />}
        description={`Manage webhook endpoints and delivery operations for ${activeOrganization?.name ?? "your organization"}.`}
        title="Webhooks"
      />
      <hr className="my-8" />

      <WebhooksControls
        activeTab={activeTab}
        environmentFilter={environmentFilter}
        onEnvironmentChange={setEnvironmentFilter}
        onTabChange={setActiveTab}
      />

      <p className="mb-6 text-muted-foreground text-sm">
        {activeTabDescription}
      </p>

      {tabContentByValue[activeTab]}

      <SecretDialog
        onOpenChange={(open) => {
          if (!open) {
            setSecretDialog(INITIAL_SECRET_DIALOG_STATE);
          }
        }}
        state={secretDialog}
      />
    </div>
  );
}

function SecretDialog({
  onOpenChange,
  state,
}: {
  onOpenChange: (open: boolean) => void;
  state: SecretDialogState;
}) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <Dialog onOpenChange={onOpenChange} open={state.open}>
      <DialogContent className="flex w-full max-w-2xl! flex-col">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="signing-secret">Signing secret</Label>
          <div className="relative">
            <Textarea
              className="min-h-[144px] resize-none pr-24 font-mono text-sm"
              id="signing-secret"
              readOnly
              value={state.secret}
            />
            <Button
              aria-label="Copy signing secret"
              className="absolute top-3 right-3"
              onClick={() => copy(state.secret)}
              size="sm"
              type="button"
              variant="outline"
            >
              <CopyIcon className="mr-2 size-4" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            This is the current outbound signing secret for endpoint{" "}
            <span className="font-mono">{state.endpointId}</span>.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateEndpointDialog({
  onSubmit,
}: {
  onSubmit: (input: {
    enabled: boolean;
    environment: Environment;
    subscribedEventTypes: string[];
    url: string;
  }) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [environment, setEnvironment] = useState<Environment>("live");
  const [enabled, setEnabled] = useState(true);
  const [subscribed, setSubscribed] = useState(true);
  const [url, setUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function resetState() {
    setEnvironment("live");
    setEnabled(true);
    setSubscribed(true);
    setUrl("");
    setErrorMessage("");
  }

  async function handleSubmit() {
    if (!url.trim()) {
      const error = new Error("Webhook URL is required.");
      setErrorMessage(error.message);
      throw error;
    }

    try {
      await onSubmit({
        enabled,
        environment,
        subscribedEventTypes: subscribed ? [DEFAULT_EVENT_TYPE] : [],
        url: url.trim(),
      });
      setIsOpen(false);
      resetState();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to create webhook endpoint."
      );
      throw error;
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          resetState();
        }
      }}
      open={isOpen}
    >
      <DialogTrigger
        render={
          <Button onClick={() => setIsOpen(true)}>
            <PlusIcon className="mr-2 size-4" />
            Create endpoint
          </Button>
        }
      />
      <DialogContent className="flex w-full max-w-xl! flex-col">
        <DialogHeader>
          <DialogTitle>Create webhook endpoint</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to create endpoint</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="create-webhook-url">Destination URL</Label>
            <Input
              id="create-webhook-url"
              inputMode="url"
              onChange={(event) => {
                setUrl(event.target.value);
                setErrorMessage("");
              }}
              placeholder="https://example.com/webhooks/kayle"
              value={url}
            />
          </div>

          <div className="space-y-2">
            <Label>Environment</Label>
            <div className="flex flex-wrap gap-2">
              {(["live", "test"] as Environment[]).map((option) => (
                <Button
                  key={option}
                  onClick={() => setEnvironment(option)}
                  type="button"
                  variant={environment === option ? "default" : "outline"}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="space-y-0.5">
              <Label htmlFor="create-endpoint-enabled">Enabled</Label>
              <p className="text-muted-foreground text-sm">
                Start receiving deliveries immediately after creation.
              </p>
            </div>
            <Switch
              checked={enabled}
              id="create-endpoint-enabled"
              onCheckedChange={setEnabled}
            />
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="space-y-0.5">
              <Label htmlFor="create-endpoint-subscription">
                verification.attempt.succeeded
              </Label>
              <p className="text-muted-foreground text-sm">
                Subscribe this endpoint to completed verification attempts.
              </p>
            </div>
            <Switch
              checked={subscribed}
              id="create-endpoint-subscription"
              onCheckedChange={setSubscribed}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              toast.promise(handleSubmit(), {
                loading: "Creating webhook endpoint...",
                success: "Webhook endpoint created",
                error: (error) =>
                  error instanceof Error
                    ? error.message
                    : "Failed to create webhook endpoint",
              });
            }}
            type="button"
          >
            Create endpoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyDialog({
  endpointId,
  onSubmit,
}: {
  endpointId: string;
  onSubmit: (input: {
    endpointId: string;
    jwk: JsonWebKey;
    keyId: string;
  }) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [keyId, setKeyId] = useState("");
  const [jwkInput, setJwkInput] = useState("");

  function resetState() {
    setErrorMessage("");
    setKeyId("");
    setJwkInput("");
  }

  async function handleSubmit() {
    if (!keyId.trim()) {
      const error = new Error("Key ID is required.");
      setErrorMessage(error.message);
      throw error;
    }

    try {
      await onSubmit({
        endpointId,
        jwk: parseJwkInput(jwkInput),
        keyId: keyId.trim(),
      });
      setIsOpen(false);
      resetState();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to add public key."
      );
      throw error;
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          resetState();
        }
      }}
      open={isOpen}
    >
      <DialogTrigger
        render={
          <Button onClick={() => setIsOpen(true)} size="sm" variant="outline">
            <KeyRoundIcon className="mr-2 size-4" />
            Add public key
          </Button>
        }
      />
      <DialogContent className="flex w-full max-w-2xl! flex-col">
        <DialogHeader>
          <DialogTitle>Add public key</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to add key</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="create-key-id">Key ID</Label>
            <Input
              id="create-key-id"
              onChange={(event) => {
                setKeyId(event.target.value);
                setErrorMessage("");
              }}
              placeholder="rsa-key-2026-03"
              value={keyId}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-key-jwk">Public JWK</Label>
            <Textarea
              className="min-h-[220px] font-mono text-sm"
              id="create-key-jwk"
              onChange={(event) => {
                setJwkInput(event.target.value);
                setErrorMessage("");
              }}
              placeholder={`{\n  "kty": "RSA",\n  "n": "...",\n  "e": "AQAB",\n  "alg": "RSA-OAEP-256"\n}`}
              value={jwkInput}
            />
            <p className="text-muted-foreground text-sm">
              Paste the public JWK exactly as it should be used for outbound JWE
              encryption.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              toast.promise(handleSubmit(), {
                loading: "Adding public key...",
                success: "Public key added",
                error: (error) =>
                  error instanceof Error
                    ? error.message
                    : "Failed to add public key",
              });
            }}
            type="button"
          >
            Add key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
