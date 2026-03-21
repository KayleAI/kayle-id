import { SUPPORTED_WEBHOOK_EVENT_TYPES } from "@kayle-id/config/webhook-events";
import { Alert, AlertDescription, AlertTitle } from "@kayleai/ui/alert";
import { Badge } from "@kayleai/ui/badge";
import { Button } from "@kayleai/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@kayleai/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kayleai/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@kayleai/ui/empty";
import { Input } from "@kayleai/ui/input";
import { Label } from "@kayleai/ui/label";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@kayleai/ui/sheet";
import { Switch } from "@kayleai/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kayleai/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kayleai/ui/tabs";
import { Textarea } from "@kayleai/ui/textarea";
import { cn } from "@kayleai/ui/utils/cn";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  KeyRoundIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TrashIcon,
  WebhookIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeading } from "@/components/app-heading";
import InfoCard from "@/components/info";
import { Loading } from "@/components/loading";
import { formatDate } from "@/utils/format-date";
import { useCopyToClipboard } from "@/utils/use-copy";
import {
  createWebhookEndpoint,
  createWebhookKey,
  type DeliveryStatus,
  deactivateWebhookKey,
  deleteWebhookEndpoint,
  type Environment,
  listWebhookDeliveries,
  listWebhookEndpoints,
  listWebhookEvents,
  listWebhookKeys,
  parseJwkInput,
  reactivateWebhookKey,
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

type WebhooksTab = "endpoints" | "events";
type EndpointDetailTab = "overview" | "performance" | "deliveries";
type EnvironmentFilter = Environment | "all";
type EndpointDeliveryStats = {
  failed: number;
  inFlight: number;
  lastAttemptAt: string | null;
  lastStatusCode: number | null;
  total: number;
};
type DeliveryTrendPoint = {
  failed: number;
  label: string;
  total: number;
};
type CreateEndpointInitialPublicKey = {
  jwk: JsonWebKey;
  keyId: string;
};
type CreateEndpointSubmission = {
  enabled: boolean;
  environment: Environment;
  initialPublicKey: CreateEndpointInitialPublicKey | null;
  name: string | null;
  subscribedEventTypes: string[];
  url: string;
};
type CreateEndpointSubmissionResult = {
  publicKeyError: string | null;
};
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
  label: string;
  value: WebhooksTab;
}> = [
  {
    value: "endpoints",
    label: "Endpoints",
  },
  {
    value: "events",
    label: "Events",
  },
];

const environmentOptions: Array<{
  label: string;
  value: EnvironmentFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Live", value: "live" },
  { label: "Test", value: "test" },
];

const EMPTY_ENDPOINT_DELIVERY_STATS: EndpointDeliveryStats = {
  failed: 0,
  inFlight: 0,
  lastAttemptAt: null,
  lastStatusCode: null,
  total: 0,
};
const WWW_PREFIX_REGEX = /^www\./;

function formatOptionalDate(dateString: string | null): string {
  return dateString ? formatDate(dateString) : "Never";
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatCountLabel(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

function getEndpointHostLabel(url: string): string {
  try {
    return new URL(url).host.replace(WWW_PREFIX_REGEX, "");
  } catch {
    return url;
  }
}

function getEndpointPathLabel(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname === "/" ? parsedUrl.host : parsedUrl.pathname;
  } catch {
    return url;
  }
}

function getEndpointDisplayName(
  endpoint: Pick<WebhookEndpoint, "name" | "url">
): string {
  return endpoint.name?.trim() || getEndpointPathLabel(endpoint.url);
}

function getEndpointPageTitle(
  endpoint: Pick<WebhookEndpoint, "name" | "url">
): string {
  return endpoint.name?.trim() || getEndpointHostLabel(endpoint.url);
}

function getEndpointSecondaryLabel(
  endpoint: Pick<WebhookEndpoint, "name" | "url">
): string {
  return endpoint.name?.trim()
    ? endpoint.url
    : getEndpointHostLabel(endpoint.url);
}

function getEndpointPageSubtitle(
  endpoint: Pick<WebhookEndpoint, "name" | "url">
): string {
  return endpoint.url;
}

function getDeliveryActivityTimestamp(delivery: WebhookDelivery): string {
  return delivery.last_attempt_at ?? delivery.updated_at ?? delivery.created_at;
}

function getEndpointDeliveryStats(
  deliveries: WebhookDelivery[]
): Record<string, EndpointDeliveryStats> {
  const statsByEndpoint = new Map<string, EndpointDeliveryStats>();
  const latestActivityByEndpoint = new Map<string, string>();

  for (const delivery of deliveries) {
    const current =
      statsByEndpoint.get(delivery.webhook_endpoint_id) ??
      EMPTY_ENDPOINT_DELIVERY_STATS;
    const currentActivityTime = latestActivityByEndpoint.get(
      delivery.webhook_endpoint_id
    );
    const nextActivityTime = getDeliveryActivityTimestamp(delivery);
    const useLatestDetails =
      !currentActivityTime || currentActivityTime <= nextActivityTime;

    statsByEndpoint.set(delivery.webhook_endpoint_id, {
      failed: current.failed + (delivery.status === "failed" ? 1 : 0),
      inFlight:
        current.inFlight +
        (delivery.status === "pending" || delivery.status === "delivering"
          ? 1
          : 0),
      lastAttemptAt: useLatestDetails
        ? delivery.last_attempt_at
        : current.lastAttemptAt,
      lastStatusCode: useLatestDetails
        ? delivery.last_status_code
        : current.lastStatusCode,
      total: current.total + 1,
    });

    if (useLatestDetails) {
      latestActivityByEndpoint.set(
        delivery.webhook_endpoint_id,
        nextActivityTime
      );
    }
  }

  return Object.fromEntries(statsByEndpoint);
}

function getSelectedEndpointDeliveryStats(
  deliveries: WebhookDelivery[],
  endpoint: WebhookEndpoint | null
): EndpointDeliveryStats {
  if (!endpoint) {
    return EMPTY_ENDPOINT_DELIVERY_STATS;
  }

  return (
    getEndpointDeliveryStats(deliveries)[endpoint.id] ??
    EMPTY_ENDPOINT_DELIVERY_STATS
  );
}

function getEndpointsById(
  endpoints: WebhookEndpoint[]
): Record<string, WebhookEndpoint> {
  return Object.fromEntries(
    endpoints.map((endpoint) => [endpoint.id, endpoint] as const)
  );
}

function getDeliveriesForEvent(
  deliveries: WebhookDelivery[],
  eventId: string
): WebhookDelivery[] {
  return deliveries
    .filter((delivery) => delivery.event_id === eventId)
    .sort((left, right) =>
      getDeliveryActivityTimestamp(right).localeCompare(
        getDeliveryActivityTimestamp(left)
      )
    );
}

function getAttachedEndpointIds(event: WebhookEvent): string[] {
  return Array.from(
    new Set(event.deliveries.map((delivery) => delivery.webhook_endpoint_id))
  );
}

function getRecentDeliveriesForEndpoint(
  deliveries: WebhookDelivery[],
  endpointId: string,
  limit = 10
): WebhookDelivery[] {
  return deliveries
    .filter((delivery) => delivery.webhook_endpoint_id === endpointId)
    .sort((left, right) =>
      getDeliveryActivityTimestamp(right).localeCompare(
        getDeliveryActivityTimestamp(left)
      )
    )
    .slice(0, limit);
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDeliveryTrendAnchorDate(
  deliveries: WebhookDelivery[],
  endpointId: string
): Date {
  const endpointDeliveries = deliveries.filter(
    (delivery) => delivery.webhook_endpoint_id === endpointId
  );

  if (endpointDeliveries.length === 0) {
    return new Date();
  }

  const latestTimestamp = endpointDeliveries.reduce((latest, delivery) => {
    const nextTimestamp = Date.parse(getDeliveryActivityTimestamp(delivery));
    return Number.isNaN(nextTimestamp)
      ? latest
      : Math.max(latest, nextTimestamp);
  }, 0);

  return latestTimestamp > 0 ? new Date(latestTimestamp) : new Date();
}

function getEndpointDeliveryTrend(
  deliveries: WebhookDelivery[],
  endpointId: string,
  days = 7
): DeliveryTrendPoint[] {
  const anchorDate = getDeliveryTrendAnchorDate(deliveries, endpointId);
  const points = new Map<string, DeliveryTrendPoint>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(anchorDate);
    date.setDate(anchorDate.getDate() - offset);

    const key = formatDateKey(date);
    points.set(key, {
      failed: 0,
      label: date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "numeric",
      }),
      total: 0,
    });
  }

  for (const delivery of deliveries) {
    if (delivery.webhook_endpoint_id !== endpointId) {
      continue;
    }

    const activityDate = new Date(getDeliveryActivityTimestamp(delivery));
    const point = points.get(formatDateKey(activityDate));

    if (!point) {
      continue;
    }

    point.total += 1;

    if (delivery.status === "failed") {
      point.failed += 1;
    }
  }

  return Array.from(points.values());
}

function isWebhookEndpointDirty({
  endpoint,
  endpointEnabled,
  endpointName,
  endpointSubscribedEventTypes,
  endpointUrl,
}: {
  endpoint: WebhookEndpoint | null;
  endpointEnabled: boolean;
  endpointName: string;
  endpointSubscribedEventTypes: string[];
  endpointUrl: string;
}): boolean {
  if (!endpoint) {
    return false;
  }

  return (
    (endpoint.name ?? "") !== endpointName.trim() ||
    endpoint.url !== endpointUrl ||
    endpoint.enabled !== endpointEnabled ||
    !areEventSelectionsEqual(
      endpoint.subscribed_event_types,
      endpointSubscribedEventTypes
    )
  );
}

function shouldShowMissingKeyAlert({
  endpoint,
  isKeysLoading,
  keys,
}: {
  endpoint: WebhookEndpoint | null;
  isKeysLoading: boolean;
  keys: WebhookEncryptionKey[];
}): boolean {
  return (
    endpoint !== null && !isKeysLoading && keys.every((key) => !key.is_active)
  );
}

function getEventTriggerLabel(event: WebhookEvent): string {
  return event.trigger_type.replace("_", " ");
}

function areEventSelectionsEqual(left: string[], right: string[]): boolean {
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every(
    (eventType, index) => eventType === normalizedRight[index]
  );
}

function toggleEventSelection(
  selectedEventTypes: string[],
  eventType: string
): string[] {
  if (selectedEventTypes.includes(eventType)) {
    if (selectedEventTypes.length === 1) {
      return selectedEventTypes;
    }

    return selectedEventTypes.filter(
      (selectedEventType) => selectedEventType !== eventType
    );
  }

  return [...selectedEventTypes, eventType];
}

function getWebhookEventTypeDescription(eventType: string): string {
  if (eventType === "verification.attempt.succeeded") {
    return "Dispatch completed verification attempts to this endpoint.";
  }

  return "Dispatch this event type to the endpoint when it is emitted.";
}

function getEventSubscriptionSummary(selectedEventTypes: string[]): string {
  if (selectedEventTypes.length === SUPPORTED_WEBHOOK_EVENT_TYPES.length) {
    return "All supported events";
  }

  return formatCountLabel(selectedEventTypes.length, "event");
}

function getEventSubscriptionDetail(selectedEventTypes: string[]): string {
  if (selectedEventTypes.length === SUPPORTED_WEBHOOK_EVENT_TYPES.length) {
    return "Receive every supported webhook event.";
  }

  return selectedEventTypes.join(", ");
}

function getCreateEndpointInitialPublicKey({
  publicKeyId,
  publicKeyInput,
  shouldConfigurePublicKey,
}: {
  publicKeyId: string;
  publicKeyInput: string;
  shouldConfigurePublicKey: boolean;
}): CreateEndpointInitialPublicKey | null {
  if (!shouldConfigurePublicKey) {
    return null;
  }

  if (!publicKeyId.trim()) {
    throw new Error("Key ID is required.");
  }

  return {
    jwk: parseJwkInput(publicKeyInput),
    keyId: publicKeyId.trim(),
  };
}

function getWebhookEventReplayDisabledReason(
  event: WebhookEvent
): string | null {
  if (event.type !== DEFAULT_EVENT_TYPE) {
    return "Only verification.attempt.succeeded events can be replayed.";
  }

  if (event.deliveries.length === 0) {
    return "This event has no deliveries to replay.";
  }

  return null;
}

function getEnvironmentBadgeClass(environment: Environment): string {
  return environment === "live"
    ? "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
    : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400";
}

function getStatusBadgeClass(
  status: DeliveryStatus | "active" | "disabled" | "inactive"
): string {
  if (status === "active" || status === "succeeded") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400";
  }

  if (status === "disabled") {
    return "border-border bg-muted/50 text-muted-foreground";
  }

  if (status === "pending" || status === "delivering") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400";
  }

  return "border-red-500/20 bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400";
}

function getResponseCodeClass(statusCode: number | null): string {
  if (statusCode === null) {
    return "border-border bg-muted/50 text-muted-foreground";
  }

  if (statusCode < 300) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400";
  }

  if (statusCode < 500) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400";
  }

  return "border-red-500/20 bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400";
}

function EnvironmentBadge({ environment }: { environment: Environment }) {
  return (
    <Badge
      className={cn(
        "px-2.5 py-1 text-xs capitalize",
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
  status: DeliveryStatus | "active" | "disabled" | "inactive";
}) {
  return (
    <Badge
      className={cn(
        "px-2.5 py-1 text-xs capitalize",
        getStatusBadgeClass(status)
      )}
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
    <Empty className="min-h-56 rounded-md border border-border/80 border-dashed bg-muted/10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WebhookIcon className="size-5" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
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

function ResponseCodeBadge({ statusCode }: { statusCode: number | null }) {
  return (
    <Badge
      className={cn(
        "px-2.5 py-1 font-mono text-xs",
        getResponseCodeClass(statusCode)
      )}
      variant="outline"
    >
      {statusCode ?? "n/a"}
    </Badge>
  );
}

function EventDeliverySummary({
  deliveries,
}: {
  deliveries: WebhookEvent["deliveries"];
}) {
  if (deliveries.length === 0) {
    return <p className="text-muted-foreground text-sm">No deliveries</p>;
  }

  const failedCount = deliveries.filter(
    (delivery) => delivery.status === "failed"
  ).length;
  const inFlightCount = deliveries.filter(
    (delivery) =>
      delivery.status === "pending" || delivery.status === "delivering"
  ).length;
  const endpointCount = new Set(
    deliveries.map((delivery) => delivery.webhook_endpoint_id)
  ).size;

  let secondaryLabel = formatCountLabel(deliveries.length, "delivery");

  if (failedCount > 0) {
    secondaryLabel = formatCountLabel(failedCount, "failure");
  } else if (inFlightCount > 0) {
    secondaryLabel = formatCountLabel(
      inFlightCount,
      "in-flight attempt",
      "in-flight attempts"
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-sm tabular-nums">
        {formatCountLabel(endpointCount, "endpoint")}
      </p>
      <p className="truncate text-muted-foreground text-xs">{secondaryLabel}</p>
    </div>
  );
}

function EventSubscriptionMenu({
  selectedEventTypes,
  onToggleEventType,
}: {
  selectedEventTypes: string[];
  onToggleEventType: (eventType: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-auto min-h-11 w-full items-start justify-between gap-3 px-3 py-2 text-left"
            type="button"
            variant="outline"
          >
            <div className="min-w-0">
              <div className="font-normal text-sm">
                {getEventSubscriptionSummary(selectedEventTypes)}
              </div>
              <div className="truncate text-muted-foreground text-xs">
                {getEventSubscriptionDetail(selectedEventTypes)}
              </div>
            </div>
            <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        className="w-96 max-w-[calc(100vw-3rem)] rounded-sm!"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Event subscriptions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SUPPORTED_WEBHOOK_EVENT_TYPES.map((eventType) => (
            <DropdownMenuCheckboxItem
              checked={selectedEventTypes.includes(eventType)}
              className="items-start py-2.5"
              closeOnClick={false}
              key={eventType}
              onCheckedChange={() => onToggleEventType(eventType)}
            >
              <div className="min-w-0 space-y-1 pr-4">
                <div className="font-mono text-sm">{eventType}</div>
                <p className="text-muted-foreground text-xs">
                  {getWebhookEventTypeDescription(eventType)}
                </p>
              </div>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PublicKeyFields({
  jwkInput,
  jwkInputId,
  keyId,
  keyIdId,
  onJwkInputChange,
  onKeyIdChange,
}: {
  jwkInput: string;
  jwkInputId: string;
  keyId: string;
  keyIdId: string;
  onJwkInputChange: (value: string) => void;
  onKeyIdChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={keyIdId}>Key ID</Label>
        <Input
          id={keyIdId}
          onChange={(event) => onKeyIdChange(event.target.value)}
          placeholder="rsa-key-2026-03"
          value={keyId}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={jwkInputId}>Public JWK</Label>
        <Textarea
          className="min-h-[220px] font-mono text-sm"
          id={jwkInputId}
          onChange={(event) => onJwkInputChange(event.target.value)}
          placeholder={`{\n  "kty": "RSA",\n  "n": "...",\n  "e": "AQAB",\n  "alg": "RSA-OAEP-256"\n}`}
          value={jwkInput}
        />
        <p className="text-muted-foreground text-sm">
          The uploaded key becomes the active encryption key for new deliveries
          to this endpoint.
        </p>
      </div>
    </div>
  );
}

function WebhooksToolbar({
  environmentFilter,
  onEnvironmentChange,
}: {
  environmentFilter: EnvironmentFilter;
  onEnvironmentChange: (value: EnvironmentFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-4 border-border/70 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
      <TabsList
        className="h-auto w-full justify-start gap-5 rounded-none bg-transparent p-0"
        variant="line"
      >
        {tabOptions.map((tab) => (
          <TabsTrigger
            className="h-10 flex-none rounded-none px-0 pb-2 data-active:bg-transparent"
            key={tab.value}
            value={tab.value}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
        {environmentOptions.map((option) => (
          <Button
            className="shrink-0"
            key={option.value}
            onClick={() => onEnvironmentChange(option.value)}
            size="sm"
            type="button"
            variant={environmentFilter === option.value ? "default" : "outline"}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function EndpointListCard({
  deliveryStatsByEndpoint,
  endpoints,
  isMutatingEndpointId,
  onDeleteEndpoint,
  onToggleEndpointEnabled,
}: {
  deliveryStatsByEndpoint: Record<string, EndpointDeliveryStats>;
  endpoints: WebhookEndpoint[];
  isMutatingEndpointId: string | null;
  onDeleteEndpoint: (endpoint: WebhookEndpoint) => Promise<void>;
  onToggleEndpointEnabled: (endpoint: WebhookEndpoint) => Promise<void>;
}) {
  if (endpoints.length === 0) {
    return (
      <SectionMessage
        description="Create your first webhook endpoint to start receiving verification events."
        title="No webhook endpoints yet"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/70">
      <Table className="w-full table-fixed">
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead>Destination</TableHead>
            <TableHead>Listening to</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last delivery</TableHead>
            <TableHead className="w-14 text-right">
              <span className="sr-only">More actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {endpoints.map((endpoint) => {
            const deliveryStats =
              deliveryStatsByEndpoint[endpoint.id] ??
              EMPTY_ENDPOINT_DELIVERY_STATS;

            return (
              <TableRow key={endpoint.id}>
                <TableCell className="w-[42%]">
                  <div className="min-w-0 space-y-1.5">
                    <Link
                      className="block truncate font-medium transition-colors hover:text-foreground/80 hover:underline"
                      params={{ endpoint: endpoint.id }}
                      to="/webhooks/$endpoint"
                    >
                      {getEndpointDisplayName(endpoint)}
                    </Link>
                    <div className="truncate text-muted-foreground text-xs">
                      {getEndpointSecondaryLabel(endpoint)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="w-[24%]">
                  <div className="min-w-0 space-y-1.5">
                    <div className="font-medium text-sm">
                      {getEventSubscriptionSummary(
                        endpoint.subscribed_event_types
                      )}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {getEventSubscriptionDetail(
                        endpoint.subscribed_event_types
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="w-[14%]">
                  <StatusBadge
                    status={endpoint.enabled ? "active" : "disabled"}
                  />
                </TableCell>
                <TableCell className="w-[16%]">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-muted-foreground text-sm tabular-nums">
                      {formatOptionalDate(deliveryStats.lastAttemptAt)}
                    </div>
                    <ResponseCodeBadge
                      statusCode={deliveryStats.lastStatusCode}
                    />
                  </div>
                </TableCell>
                <TableCell className="w-14 text-right">
                  <EndpointActionsMenu
                    endpoint={endpoint}
                    isMutating={isMutatingEndpointId === endpoint.id}
                    onDeleteEndpoint={onDeleteEndpoint}
                    onToggleEndpointEnabled={onToggleEndpointEnabled}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function EndpointActionsMenu({
  align = "end",
  endpoint,
  isMutating,
  onDeleteEndpoint,
  onToggleEndpointEnabled,
  showViewDetails = true,
  triggerVariant = "ghost",
}: {
  align?: "end" | "start";
  endpoint: WebhookEndpoint;
  isMutating: boolean;
  onDeleteEndpoint: (endpoint: WebhookEndpoint) => Promise<void>;
  onToggleEndpointEnabled: (endpoint: WebhookEndpoint) => Promise<void>;
  showViewDetails?: boolean;
  triggerVariant?: "ghost" | "outline";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`More actions for ${getEndpointDisplayName(endpoint)}`}
            size="icon"
            variant={triggerVariant}
          />
        }
      >
        <EllipsisVerticalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {showViewDetails ? (
          <DropdownMenuItem
            render={
              <Button
                className="flex w-full items-center justify-start"
                render={
                  <Link
                    params={{ endpoint: endpoint.id }}
                    to="/webhooks/$endpoint"
                  />
                }
                variant="ghost"
              />
            }
          >
            <EyeIcon className="size-4" />
            View details
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={isMutating}
          onClick={() => {
            toast.promise(onToggleEndpointEnabled(endpoint), {
              loading: endpoint.enabled
                ? "Pausing destination..."
                : "Enabling destination...",
              success: endpoint.enabled
                ? "Destination paused"
                : "Destination enabled",
              error: endpoint.enabled
                ? "Failed to pause destination"
                : "Failed to enable destination",
            });
          }}
          render={
            <Button
              className="flex w-full items-center justify-start"
              variant="ghost"
            />
          }
        >
          {endpoint.enabled ? (
            <PauseIcon className="size-4" />
          ) : (
            <PlayIcon className="size-4" />
          )}
          {endpoint.enabled ? "Pause destination" : "Enable destination"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isMutating}
          onClick={() => {
            toast.promise(onDeleteEndpoint(endpoint), {
              loading: "Deleting destination...",
              success: "Destination deleted",
              error: "Failed to delete destination",
            });
          }}
          render={
            <Button
              className="flex w-full items-center justify-start"
              variant="ghost"
            />
          }
          variant="destructive"
        >
          <TrashIcon className="size-4" />
          Delete destination
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EndpointPerformancePanel({
  endpointDeliveryStats,
  isDeliveriesLoading,
  trendPoints,
}: {
  endpointDeliveryStats: EndpointDeliveryStats;
  isDeliveriesLoading: boolean;
  trendPoints: DeliveryTrendPoint[];
}) {
  if (isDeliveriesLoading) {
    return (
      <div className="overflow-hidden rounded-md border border-border/70">
        <div className="border-border/70 border-b px-4 py-4">
          <h2 className="font-medium text-sm">Performance</h2>
        </div>
        <LoadingState minHeight="min-h-64" />
      </div>
    );
  }

  const maxValue = Math.max(
    1,
    ...trendPoints.map((point) => Math.max(point.total, point.failed))
  );
  const succeededCount = Math.max(
    endpointDeliveryStats.total -
      endpointDeliveryStats.failed -
      endpointDeliveryStats.inFlight,
    0
  );

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <div className="flex items-start justify-between gap-4 border-border/70 border-b px-4 py-4">
        <div className="space-y-1">
          <h2 className="font-medium text-sm">Performance</h2>
          <p className="text-muted-foreground text-sm">
            Delivery activity over the last 7 days.
          </p>
        </div>
        <span className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
          Last 7 days
        </span>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4 border-border/70 p-4 xl:border-r">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-foreground/35" />
              Total
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-500/40" />
              Failed
            </div>
          </div>

          <div className="flex h-44 items-end gap-3">
            {trendPoints.map((point) => (
              <div
                className="flex min-w-0 flex-1 flex-col items-center gap-2"
                key={point.label}
              >
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div
                    className="w-full max-w-3 rounded-sm bg-foreground/15"
                    style={{
                      height:
                        point.total > 0
                          ? `${Math.max((point.total / maxValue) * 100, 8)}%`
                          : "0%",
                    }}
                  />
                  <div
                    className="w-full max-w-3 rounded-sm bg-red-500/30"
                    style={{
                      height:
                        point.failed > 0
                          ? `${Math.max((point.failed / maxValue) * 100, 8)}%`
                          : "0%",
                    }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {point.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 px-4 py-4">
          <h3 className="font-medium text-sm">Delivery overview</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Total deliveries</dt>
              <dd className="font-medium tabular-nums">
                {formatCount(endpointDeliveryStats.total)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Succeeded</dt>
              <dd className="font-medium tabular-nums">
                {formatCount(succeededCount)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Failed</dt>
              <dd className="font-medium tabular-nums">
                {formatCount(endpointDeliveryStats.failed)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">In flight</dt>
              <dd className="font-medium tabular-nums">
                {formatCount(endpointDeliveryStats.inFlight)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Last response</dt>
              <dd>
                <ResponseCodeBadge
                  statusCode={endpointDeliveryStats.lastStatusCode}
                />
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function EndpointDetailsPanel({ endpoint }: { endpoint: WebhookEndpoint }) {
  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <div className="border-border/70 border-b px-4 py-3">
        <h2 className="font-medium text-sm">Destination details</h2>
      </div>

      <dl className="divide-y divide-border/70 text-sm">
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Destination ID</dt>
          <dd className="break-all font-mono text-xs">{endpoint.id}</dd>
        </div>
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="min-w-0">{getEndpointDisplayName(endpoint)}</dd>
        </div>
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Endpoint URL</dt>
          <dd className="break-all">{endpoint.url}</dd>
        </div>
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
          <dt className="text-muted-foreground">Listening to</dt>
          <dd className="min-w-0 space-y-0.5">
            <div>
              {getEventSubscriptionSummary(endpoint.subscribed_event_types)}
            </div>
            <div className="text-muted-foreground text-xs">
              {getEventSubscriptionDetail(endpoint.subscribed_event_types)}
            </div>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function EndpointSigningSecretCard({
  secret,
  isRevealing,
  isRotating,
  onRevealSecret,
  onRotateSecret,
}: {
  secret: string | null;
  isRevealing: boolean;
  isRotating: boolean;
  onRevealSecret: () => Promise<void>;
  onRotateSecret: () => Promise<void>;
}) {
  const isSecretVisible = Boolean(secret);
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-medium text-sm">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            Signing secret
          </div>
          <p className="text-muted-foreground text-sm leading-6">
            Use this secret to verify that deliveries came from Kayle ID. Reveal
            it temporarily or rotate it if you need to replace it.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-4 py-3">
          <div className="min-w-0 flex-1 truncate font-mono text-foreground/90 text-sm">
            {secret ?? `whsec_${".".repeat(32)}`}
          </div>
          <div className="flex items-center gap-1">
            {secret ? (
              <Button
                aria-label={
                  copied ? "Signing secret copied" : "Copy signing secret"
                }
                onClick={() => {
                  copy(secret);
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <CopyIcon className="size-4" />
              </Button>
            ) : null}
            <Button
              aria-label={
                isSecretVisible
                  ? "Hide signing secret"
                  : "Reveal signing secret"
              }
              disabled={isRevealing}
              onClick={() => {
                if (isSecretVisible) {
                  onRevealSecret();
                  return;
                }

                showAsyncToast(onRevealSecret(), {
                  loading: "Revealing signing secret...",
                  success: "Signing secret revealed",
                  error: "Failed to reveal signing secret",
                });
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              {isRevealing ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </Button>
            <Button
              aria-label="Rotate signing secret"
              disabled={isRotating}
              onClick={() =>
                showAsyncToast(onRotateSecret(), {
                  loading: "Rotating signing secret...",
                  success: "Signing secret rotated",
                  error: "Failed to rotate signing secret",
                })
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              {isRotating ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndpointResourcesCard() {
  const resources = [
    {
      href: "https://kayle.id/docs/api/webhooks/endpoints#get-by-id",
      label: "Endpoint API reference",
    },
    {
      href: "https://kayle.id/docs/api/webhooks/endpoints#rotate-signing-secret",
      label: "Signing secret reference",
    },
    {
      href: "https://kayle.id/docs/api/webhooks/deliveries#retry",
      label: "Delivery retry reference",
    },
  ] as const;

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <div className="border-border/70 border-b px-4 py-4">
        <h2 className="font-medium text-sm">Resources</h2>
      </div>

      <div className="space-y-3 px-4 py-4 text-sm">
        {resources.map((resource) => (
          <a
            className="block text-foreground transition-colors hover:text-foreground/70 hover:underline"
            href={resource.href}
            key={resource.href}
            rel="noopener"
            target="_blank"
          >
            {resource.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function EditEndpointDrawer({
  endpointEnabled,
  endpointName,
  endpointSubscribedEventTypes,
  endpointUrl,
  isDirty,
  isSaving,
  onEndpointEnabledChange,
  onEndpointNameChange,
  onToggleEndpointEventType,
  onEndpointUrlChange,
  onReset,
  onSaveEndpoint,
}: {
  endpointEnabled: boolean;
  endpointName: string;
  endpointSubscribedEventTypes: string[];
  endpointUrl: string;
  isDirty: boolean;
  isSaving: boolean;
  onEndpointEnabledChange: (enabled: boolean) => void;
  onEndpointNameChange: (value: string) => void;
  onToggleEndpointEventType: (eventType: string) => void;
  onEndpointUrlChange: (value: string) => void;
  onReset: () => void;
  onSaveEndpoint: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  async function handleSaveAndClose(): Promise<void> {
    await onSaveEndpoint();
    setIsOpen(false);
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open) {
          onReset();
        }
      }}
      open={isOpen}
    >
      <SheetTrigger
        render={
          <Button type="button" variant="outline">
            Edit destination
          </Button>
        }
      />
      <SheetContent
        className="flex w-full flex-col overflow-hidden sm:max-w-2xl"
        side="right"
      >
        <div className="border-border/70 border-b px-6 py-5">
          <SheetTitle>Edit destination</SheetTitle>
          <p className="mt-1 text-muted-foreground text-sm">
            Update the label, endpoint URL, event subscriptions, and delivery
            state.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="webhook-name">Endpoint name</Label>
            <Input
              className="h-11"
              id="webhook-name"
              onChange={(event) => onEndpointNameChange(event.target.value)}
              placeholder="Primary production webhook"
              value={endpointName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-url">Destination URL</Label>
            <Input
              className="h-11"
              id="webhook-url"
              onChange={(event) => onEndpointUrlChange(event.target.value)}
              value={endpointUrl}
            />
          </div>

          <div className="space-y-2">
            <Label>Event subscriptions</Label>
            <EventSubscriptionMenu
              onToggleEventType={onToggleEndpointEventType}
              selectedEventTypes={endpointSubscribedEventTypes}
            />
          </div>

          <div className="flex items-start justify-between gap-6 rounded-md border border-border/70 px-4 py-3">
            <div className="space-y-1">
              <Label htmlFor="endpoint-enabled">Enabled</Label>
              <p className="text-muted-foreground text-xs">
                Allow this destination to receive new deliveries.
              </p>
            </div>
            <div className="pt-0.5">
              <Switch
                checked={endpointEnabled}
                id="endpoint-enabled"
                onCheckedChange={onEndpointEnabledChange}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end border-border/70 border-t px-6 py-4">
          <Button
            disabled={!isDirty || isSaving}
            onClick={() =>
              showAsyncToast(handleSaveAndClose(), {
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
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EndpointKeysCard({
  endpointId,
  error,
  isUpdating,
  isLoading,
  keys,
  onCreateKey,
  onDeactivateKey,
  onReactivateKey,
}: {
  endpointId: string;
  error: unknown;
  isUpdating: boolean;
  isLoading: boolean;
  keys: WebhookEncryptionKey[];
  onCreateKey: (input: {
    endpointId: string;
    jwk: JsonWebKey;
    keyId: string;
  }) => Promise<void>;
  onDeactivateKey: (keyId: string) => Promise<void>;
  onReactivateKey: (keyId: string) => Promise<void>;
}) {
  function handleToggleKey(key: WebhookEncryptionKey): void {
    const request = key.is_active
      ? onDeactivateKey(key.id)
      : onReactivateKey(key.id);

    showAsyncToast(request, {
      loading: key.is_active ? "Deactivating key..." : "Re-enabling key...",
      success: key.is_active ? "Key deactivated" : "Key re-enabled",
      error: key.is_active
        ? "Failed to deactivate key"
        : "Failed to re-enable key",
    });
  }

  let content: ReactNode;

  if (isLoading) {
    content = <LoadingState minHeight="min-h-24" />;
  } else if (keys.length === 0) {
    content = (
      <div className="px-4 py-5 text-muted-foreground text-sm">
        No public keys yet. Add a public JWK to encrypt outbound payloads for
        this destination.
      </div>
    );
  } else {
    content = (
      <div className="divide-y divide-border/70">
        {keys.map((key) => (
          <div className="space-y-3 px-4 py-4" key={key.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="truncate font-medium text-sm">{key.key_id}</div>
                <div className="truncate font-mono text-muted-foreground text-xs">
                  {key.algorithm} · {key.id}
                </div>
              </div>
              <StatusBadge status={key.is_active ? "active" : "inactive"} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatDate(key.created_at)}
              </p>
              <Button
                disabled={isUpdating}
                onClick={() => handleToggleKey(key)}
                size="sm"
                type="button"
                variant="outline"
              >
                {key.is_active ? "Deactivate" : "Re-enable"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/70">
      <div className="flex items-start justify-between gap-3 border-border/70 border-b px-4 py-4">
        <div className="space-y-1">
          <h2 className="font-medium text-sm">Public keys</h2>
        </div>
        <CreateKeyDialog endpointId={endpointId} onSubmit={onCreateKey} />
      </div>
      <div className="space-y-4">
        <QueryErrorAlert
          error={error}
          fallback="Webhook keys could not be loaded."
          title="Failed to load keys"
        />
        {content}
      </div>
    </div>
  );
}

function EndpointsTabContent({
  deliveryStatsByEndpoint,
  endpointError,
  endpoints,
  isMutatingEndpointId,
  onDeleteEndpoint,
  onToggleEndpointEnabled,
}: {
  deliveryStatsByEndpoint: Record<string, EndpointDeliveryStats>;
  endpointError: unknown;
  endpoints: WebhookEndpoint[];
  isMutatingEndpointId: string | null;
  onDeleteEndpoint: (endpoint: WebhookEndpoint) => Promise<void>;
  onToggleEndpointEnabled: (endpoint: WebhookEndpoint) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <QueryErrorAlert
        error={endpointError}
        fallback="Webhook endpoints could not be loaded."
        title="Failed to load webhook endpoints"
      />

      <EndpointListCard
        deliveryStatsByEndpoint={deliveryStatsByEndpoint}
        endpoints={endpoints}
        isMutatingEndpointId={isMutatingEndpointId}
        onDeleteEndpoint={onDeleteEndpoint}
        onToggleEndpointEnabled={onToggleEndpointEnabled}
      />
    </div>
  );
}

function EventsTabContent({
  error,
  events,
  isLoading,
}: {
  error: unknown;
  events: WebhookEvent[];
  isLoading: boolean;
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
      <div className="overflow-hidden rounded-md border border-border/70">
        <Table className="w-full table-fixed">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-[42%]">Event</TableHead>
              <TableHead className="w-[10%]">Environment</TableHead>
              <TableHead className="w-[22%]">Origin</TableHead>
              <TableHead className="w-[12%]">Deliveries</TableHead>
              <TableHead className="w-[14%]">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <div className="min-w-0 space-y-1.5">
                    <Link
                      className="block truncate font-medium transition-colors hover:text-foreground/80 hover:underline"
                      params={{ event: event.id }}
                      search={{ tab: "events" }}
                      to="/webhooks/events/$event"
                    >
                      {event.type}
                    </Link>
                    <div className="truncate font-mono text-muted-foreground text-xs">
                      {event.id}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <EnvironmentBadge environment={event.environment} />
                </TableCell>
                <TableCell>
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm">{getEventTriggerLabel(event)}</div>
                    <div className="truncate font-mono text-muted-foreground text-xs">
                      {event.trigger_id}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <EventDeliverySummary deliveries={event.deliveries} />
                </TableCell>
                <TableCell>
                  <div className="truncate text-muted-foreground text-sm tabular-nums">
                    {formatDate(event.created_at)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <QueryErrorAlert
        error={error}
        fallback="Webhook events could not be loaded."
        title="Failed to load webhook events"
      />
      {content}
    </div>
  );
}

function DeliveriesTabContent({
  context,
  deliveries,
  endpointsById,
  error,
  isLoading,
  isRetrying,
  onRetryDelivery,
}: {
  context: "endpoint" | "event";
  deliveries: WebhookDelivery[];
  endpointsById?: Record<string, WebhookEndpoint>;
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
        description={
          context === "event"
            ? "Delivery attempts for this event will appear here once endpoints begin receiving it."
            : "Delivery attempts for this endpoint will appear here after events are queued."
        }
        title={
          context === "event" ? "No delivery history yet" : "No deliveries yet"
        }
      />
    );
  } else {
    content = (
      <div className="overflow-x-auto rounded-md border border-border/70">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Delivery</TableHead>
              <TableHead>
                {context === "event" ? "Endpoint" : "Event"}
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Response</TableHead>
              <TableHead>Last attempt</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => {
              const endpoint = endpointsById?.[delivery.webhook_endpoint_id];

              return (
                <TableRow key={delivery.id}>
                  <TableCell className="min-w-[18rem]">
                    <div className="space-y-1.5">
                      <div className="font-mono text-sm">{delivery.id}</div>
                      <div className="font-mono text-muted-foreground text-xs">
                        {delivery.webhook_encryption_key_id ??
                          "No encryption key"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[16rem]">
                    {context === "event" ? (
                      <div className="space-y-1.5">
                        {endpoint ? (
                          <>
                            <Link
                              className="font-medium transition-colors hover:text-foreground/80 hover:underline"
                              params={{ endpoint: endpoint.id }}
                              to="/webhooks/$endpoint"
                            >
                              {getEndpointDisplayName(endpoint)}
                            </Link>
                            <div className="truncate text-muted-foreground text-xs">
                              {getEndpointSecondaryLabel(endpoint)}
                            </div>
                          </>
                        ) : (
                          <div className="font-mono text-xs">
                            {delivery.webhook_endpoint_id}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Link
                          className="font-mono text-sm transition-colors hover:text-foreground/80 hover:underline"
                          params={{ event: delivery.event_id }}
                          search={{ tab: "events" }}
                          to="/webhooks/events/$event"
                        >
                          {delivery.event_id}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          Delivery event reference
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={delivery.status} />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {delivery.attempt_count}
                  </TableCell>
                  <TableCell>
                    <ResponseCodeBadge statusCode={delivery.last_status_code} />
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
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <QueryErrorAlert
        error={error}
        fallback="Webhook deliveries could not be loaded."
        title="Failed to load deliveries"
      />
      {content}
    </div>
  );
}

function EventAttachedEndpointsCard({
  endpointsById,
  error,
  event,
}: {
  endpointsById: Record<string, WebhookEndpoint>;
  error: unknown;
  event: WebhookEvent;
}) {
  let content: ReactNode;

  if (event.deliveries.length === 0) {
    content = (
      <SectionMessage
        description="This event has not been attached to any webhook endpoints yet."
        title="No attached endpoints"
      />
    );
  } else {
    content = (
      <div className="overflow-x-auto rounded-md border border-border/70">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Endpoint</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Response</TableHead>
              <TableHead>Last attempt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {event.deliveries.map((delivery) => {
              const endpoint = endpointsById[delivery.webhook_endpoint_id];

              return (
                <TableRow key={delivery.id}>
                  <TableCell className="min-w-[18rem]">
                    {endpoint ? (
                      <div className="space-y-1.5">
                        <Link
                          className="font-medium transition-colors hover:text-foreground/80 hover:underline"
                          params={{ endpoint: endpoint.id }}
                          to="/webhooks/$endpoint"
                        >
                          {getEndpointDisplayName(endpoint)}
                        </Link>
                        <div className="truncate text-muted-foreground text-xs">
                          {getEndpointSecondaryLabel(endpoint)}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="font-mono text-sm">
                          {delivery.webhook_endpoint_id}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          Endpoint details unavailable
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={delivery.status} />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {delivery.attempt_count}
                  </TableCell>
                  <TableCell>
                    <ResponseCodeBadge statusCode={delivery.last_status_code} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm tabular-nums">
                    {formatOptionalDate(delivery.last_attempt_at)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-medium text-sm">Attached endpoints</h2>
      <QueryErrorAlert
        error={error}
        fallback="Webhook endpoint details could not be loaded."
        title="Failed to load attached endpoints"
      />
      {content}
    </div>
  );
}

function EventOverviewCard({
  event,
  isReplaying,
  onReplayEvent,
}: {
  event: WebhookEvent;
  isReplaying: boolean;
  onReplayEvent: (eventId: string) => Promise<void>;
}) {
  const replayDisabledReason = getWebhookEventReplayDisabledReason(event);

  return (
    <div className="space-y-4 rounded-md border border-border/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium text-sm">Replay options</h2>
        <EnvironmentBadge environment={event.environment} />
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Origin</dt>
          <dd className="text-right">{getEventTriggerLabel(event)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Attached endpoints</dt>
          <dd className="font-medium tabular-nums">
            {formatCount(getAttachedEndpointIds(event).length)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Created</dt>
          <dd className="text-right text-muted-foreground tabular-nums">
            {formatDate(event.created_at)}
          </dd>
        </div>
      </dl>

      <div className="space-y-2">
        {replayDisabledReason ? (
          <p className="text-muted-foreground text-sm">
            {replayDisabledReason}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Replay this event across every attached endpoint. Retry a single
            destination from the delivery history when you only need to requeue
            one attempt.
          </p>
        )}
        <p className="break-all font-mono text-muted-foreground text-xs">
          {event.trigger_id}
        </p>
      </div>

      <Button
        className="w-full"
        disabled={isReplaying || replayDisabledReason !== null}
        onClick={() =>
          showAsyncToast(onReplayEvent(event.id), {
            loading: "Replaying event...",
            success: "Webhook event replayed",
            error: "Failed to replay event",
          })
        }
        type="button"
      >
        {isReplaying ? (
          <Loader2Icon className="mr-2 size-4 animate-spin" />
        ) : null}
        Replay event
      </Button>
    </div>
  );
}

type WebhooksPageProps = {
  activeTab?: WebhooksTab;
  onActiveTabChange?: (tab: WebhooksTab) => void;
};

export function WebhooksPage({
  activeTab: activeTabProp,
  onActiveTabChange,
}: WebhooksPageProps = {}) {
  const queryClient = useQueryClient();
  const [internalActiveTab, setInternalActiveTab] =
    useState<WebhooksTab>("endpoints");
  const [environmentFilter, setEnvironmentFilter] =
    useState<EnvironmentFilter>("all");
  const [secretDialog, setSecretDialog] = useState<SecretDialogState>(
    INITIAL_SECRET_DIALOG_STATE
  );
  const activeTab = activeTabProp ?? internalActiveTab;

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

  const createEndpointMutation = useMutation({
    mutationFn: createWebhookEndpoint,
  });
  const createKeyMutation = useMutation({
    mutationFn: createWebhookKey,
  });
  const updateEndpointMutation = useMutation({
    mutationFn: updateWebhookEndpoint,
  });
  const deleteEndpointMutation = useMutation({
    mutationFn: deleteWebhookEndpoint,
  });

  const events = eventsQuery.data?.data ?? [];
  const deliveries = deliveriesQuery.data?.data ?? [];
  const endpointDeliveryStats = getEndpointDeliveryStats(deliveries);

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

  function handleActiveTabChange(nextTab: WebhooksTab): void {
    setInternalActiveTab(nextTab);
    onActiveTabChange?.(nextTab);
  }

  async function handleCreateEndpoint(
    input: CreateEndpointSubmission
  ): Promise<CreateEndpointSubmissionResult> {
    const result = await createEndpointMutation.mutateAsync({
      enabled: input.enabled,
      environment: input.environment,
      name: input.name,
      subscribedEventTypes: input.subscribedEventTypes,
      url: input.url,
    });

    let publicKeyError: string | null = null;

    if (input.initialPublicKey) {
      try {
        await createKeyMutation.mutateAsync({
          endpointId: result.endpoint.id,
          jwk: input.initialPublicKey.jwk,
          keyId: input.initialPublicKey.keyId,
        });
      } catch (error) {
        publicKeyError = getErrorMessage(
          error,
          "The endpoint was created, but the public key could not be added."
        );
      }
    }

    await refreshWebhookQueries();
    handleActiveTabChange("endpoints");
    openSecretDialog({
      endpoint_id: result.endpoint.id,
      signing_secret: result.signing_secret,
      title: "Webhook signing secret created",
    });

    return {
      publicKeyError,
    };
  }

  async function handleToggleEndpointEnabled(
    endpoint: WebhookEndpoint
  ): Promise<void> {
    await updateEndpointMutation.mutateAsync({
      endpointId: endpoint.id,
      enabled: !endpoint.enabled,
      name: endpoint.name,
      subscribedEventTypes: endpoint.subscribed_event_types,
      url: endpoint.url,
    });

    await refreshWebhookQueries();
  }

  async function handleDeleteEndpoint(
    endpoint: WebhookEndpoint
  ): Promise<void> {
    await deleteEndpointMutation.mutateAsync(endpoint.id);
    await refreshWebhookQueries();
  }

  let mutatingEndpointId: string | null = null;

  if (updateEndpointMutation.isPending) {
    mutatingEndpointId = updateEndpointMutation.variables?.endpointId ?? null;
  } else if (deleteEndpointMutation.isPending) {
    mutatingEndpointId = deleteEndpointMutation.variables;
  }

  if (endpointsQuery.isLoading && !endpointsQuery.data) {
    return (
      <div className="fixed inset-0">
        <Loading layout />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 grow flex-col">
      <AppHeading
        button={<CreateEndpointDrawer onSubmit={handleCreateEndpoint} />}
        title="Webhooks"
      />

      <Tabs
        className="mt-6 gap-5"
        onValueChange={(value) => handleActiveTabChange(value as WebhooksTab)}
        value={activeTab}
      >
        <WebhooksToolbar
          environmentFilter={environmentFilter}
          onEnvironmentChange={setEnvironmentFilter}
        />

        <TabsContent value="endpoints">
          <EndpointsTabContent
            deliveryStatsByEndpoint={endpointDeliveryStats}
            endpointError={endpointsQuery.error}
            endpoints={endpoints}
            isMutatingEndpointId={mutatingEndpointId}
            onDeleteEndpoint={handleDeleteEndpoint}
            onToggleEndpointEnabled={handleToggleEndpointEnabled}
          />
        </TabsContent>

        <TabsContent value="events">
          <EventsTabContent
            error={eventsQuery.error}
            events={events}
            isLoading={eventsQuery.isLoading}
          />
        </TabsContent>
      </Tabs>

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

export function WebhookEventPage({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();

  const eventsQuery = useQuery({
    queryKey: ["webhooks", "events"],
    queryFn: () =>
      listWebhookEvents({
        limit: 100,
      }),
  });

  const event =
    eventsQuery.data?.data.find((item) => item.id === eventId) ?? null;

  const endpointsQuery = useQuery({
    enabled: Boolean(event),
    queryKey: ["webhooks", "endpoints", event?.environment],
    queryFn: () =>
      listWebhookEndpoints({
        environment: event?.environment,
        limit: 100,
      }),
  });

  const deliveriesQuery = useQuery({
    enabled: Boolean(event),
    queryKey: ["webhooks", "deliveries", event?.environment],
    queryFn: () =>
      listWebhookDeliveries({
        environment: event?.environment,
        limit: 100,
      }),
  });

  const replayEventMutation = useMutation({
    mutationFn: replayWebhookEvent,
  });
  const retryDeliveryMutation = useMutation({
    mutationFn: retryWebhookDelivery,
  });

  const endpoints = endpointsQuery.data?.data ?? [];
  const endpointsById = getEndpointsById(endpoints);
  const eventDeliveries = event
    ? getDeliveriesForEvent(deliveriesQuery.data?.data ?? [], event.id)
    : [];

  function refreshWebhookQueries(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: ["webhooks"] });
  }

  async function handleReplayEvent(targetEventId: string): Promise<void> {
    await replayEventMutation.mutateAsync(targetEventId);
    await refreshWebhookQueries();
  }

  async function handleRetryDelivery(deliveryId: string): Promise<void> {
    await retryDeliveryMutation.mutateAsync(deliveryId);
    await refreshWebhookQueries();
  }

  if (eventsQuery.isLoading && !eventsQuery.data) {
    return (
      <div className="fixed inset-0">
        <Loading layout />
      </div>
    );
  }

  if (eventsQuery.error) {
    return (
      <InfoCard
        buttons={{
          primary: {
            href: "/webhooks?tab=events",
            label: "Back to webhooks",
          },
        }}
        colour="red"
        footer={false}
        header={{
          title: "Error",
          description: "Failed to load webhook event",
        }}
        message={{
          title: "Webhook event unavailable",
          description: getErrorMessage(
            eventsQuery.error,
            "Failed to load webhook event."
          ),
        }}
      />
    );
  }

  if (!event) {
    return (
      <InfoCard
        buttons={{
          primary: {
            href: "/webhooks?tab=events",
            label: "Back to webhooks",
          },
        }}
        colour="red"
        footer={false}
        header={{
          title: "Not Found",
          description: "Webhook event not found",
        }}
        message={{
          title: "Event not found",
          description:
            "The webhook event you're looking for doesn't exist or is no longer available.",
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 grow flex-col">
      <div className="mb-4">
        <Button
          nativeButton={false}
          render={
            <Link search={{ tab: "events" }} to="/webhooks">
              Back to webhooks
            </Link>
          }
          size="sm"
          variant="outline"
        />
      </div>

      <AppHeading title={event.type} />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <EnvironmentBadge environment={event.environment} />
        <span className="text-muted-foreground text-sm">
          {getEventTriggerLabel(event)}
        </span>
        <span className="break-all font-mono text-muted-foreground text-xs">
          {event.id}
        </span>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.55fr)]">
        <EventAttachedEndpointsCard
          endpointsById={endpointsById}
          error={endpointsQuery.error}
          event={event}
        />
        <EventOverviewCard
          event={event}
          isReplaying={replayEventMutation.isPending}
          onReplayEvent={handleReplayEvent}
        />
      </div>

      <div className="mt-8 space-y-3">
        <h2 className="font-medium text-sm">Delivery history</h2>
        <DeliveriesTabContent
          context="event"
          deliveries={eventDeliveries}
          endpointsById={endpointsById}
          error={deliveriesQuery.error}
          isLoading={deliveriesQuery.isLoading}
          isRetrying={retryDeliveryMutation.isPending}
          onRetryDelivery={handleRetryDelivery}
        />
      </div>
    </div>
  );
}

export function WebhookEndpointPage({ endpointId }: { endpointId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<EndpointDetailTab>("overview");
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpointEnabled, setEndpointEnabled] = useState(true);
  const [endpointSubscribedEventTypes, setEndpointSubscribedEventTypes] =
    useState<string[]>([...SUPPORTED_WEBHOOK_EVENT_TYPES]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const endpointsQuery = useQuery({
    queryKey: ["webhooks", "endpoints"],
    queryFn: () =>
      listWebhookEndpoints({
        limit: 50,
      }),
  });

  const endpoint =
    endpointsQuery.data?.data.find((item) => item.id === endpointId) ?? null;

  const keysQuery = useQuery({
    enabled: Boolean(endpoint),
    queryKey: ["webhooks", "keys", endpointId],
    queryFn: () =>
      listWebhookKeys({
        endpointId,
        limit: 50,
      }),
  });

  const deliveriesQuery = useQuery({
    queryKey: ["webhooks", "deliveries"],
    queryFn: () =>
      listWebhookDeliveries({
        limit: 50,
      }),
  });

  useEffect(() => {
    if (!endpoint) {
      setEndpointName("");
      setEndpointUrl("");
      setEndpointEnabled(true);
      setEndpointSubscribedEventTypes([...SUPPORTED_WEBHOOK_EVENT_TYPES]);
      setRevealedSecret(null);
      return;
    }

    setEndpointName(endpoint.name ?? "");
    setEndpointUrl(endpoint.url);
    setEndpointEnabled(endpoint.enabled);
    setEndpointSubscribedEventTypes(endpoint.subscribed_event_types);
    setRevealedSecret(null);
  }, [endpoint]);

  const updateEndpointMutation = useMutation({
    mutationFn: updateWebhookEndpoint,
  });
  const revealSecretMutation = useMutation({
    mutationFn: revealWebhookSigningSecret,
  });
  const rotateSecretMutation = useMutation({
    mutationFn: rotateWebhookSigningSecret,
  });
  const deleteEndpointMutation = useMutation({
    mutationFn: deleteWebhookEndpoint,
  });
  const createKeyMutation = useMutation({
    mutationFn: createWebhookKey,
  });
  const deactivateKeyMutation = useMutation({
    mutationFn: deactivateWebhookKey,
  });
  const reactivateKeyMutation = useMutation({
    mutationFn: reactivateWebhookKey,
  });
  const retryDeliveryMutation = useMutation({
    mutationFn: retryWebhookDelivery,
  });

  const keys = keysQuery.data?.data ?? [];
  const deliveries = deliveriesQuery.data?.data ?? [];
  const endpointDeliveries = getRecentDeliveriesForEndpoint(
    deliveries,
    endpointId
  );
  const endpointDeliveryTrend = getEndpointDeliveryTrend(
    deliveries,
    endpointId
  );
  const endpointDeliveryStats = getSelectedEndpointDeliveryStats(
    deliveries,
    endpoint
  );
  const isEndpointDirty = isWebhookEndpointDirty({
    endpoint,
    endpointEnabled,
    endpointName,
    endpointSubscribedEventTypes,
    endpointUrl,
  });
  const showMissingKeyAlert = shouldShowMissingKeyAlert({
    endpoint,
    isKeysLoading: keysQuery.isLoading,
    keys,
  });

  function refreshWebhookQueries(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: ["webhooks"] });
  }

  function resetEndpointDraft(): void {
    if (!endpoint) {
      return;
    }

    setEndpointName(endpoint.name ?? "");
    setEndpointUrl(endpoint.url);
    setEndpointEnabled(endpoint.enabled);
    setEndpointSubscribedEventTypes(endpoint.subscribed_event_types);
  }

  async function handleSaveEndpoint(): Promise<void> {
    if (!endpoint) {
      return;
    }

    if (!endpointUrl.trim()) {
      throw new Error("Webhook URL is required.");
    }

    await updateEndpointMutation.mutateAsync({
      endpointId: endpoint.id,
      name: endpointName.trim() || null,
      url: endpointUrl.trim(),
      enabled: endpointEnabled,
      subscribedEventTypes: endpointSubscribedEventTypes,
    });
    await refreshWebhookQueries();
  }

  async function handleToggleEndpointEnabled(
    nextEndpoint: WebhookEndpoint
  ): Promise<void> {
    await updateEndpointMutation.mutateAsync({
      endpointId: nextEndpoint.id,
      enabled: !nextEndpoint.enabled,
      name: nextEndpoint.name,
      subscribedEventTypes: nextEndpoint.subscribed_event_types,
      url: nextEndpoint.url,
    });
    await refreshWebhookQueries();
  }

  async function handleDeleteEndpoint(
    nextEndpoint: WebhookEndpoint
  ): Promise<void> {
    await deleteEndpointMutation.mutateAsync(nextEndpoint.id);
    await refreshWebhookQueries();
    navigate({ replace: true, to: "/webhooks" });
  }

  async function handleRevealSecret(): Promise<void> {
    if (revealedSecret) {
      setRevealedSecret(null);
      return;
    }

    const result = await revealSecretMutation.mutateAsync(endpointId);
    setRevealedSecret(result.signing_secret);
  }

  async function handleRotateSecret(): Promise<void> {
    const result = await rotateSecretMutation.mutateAsync(endpointId);
    await refreshWebhookQueries();
    setRevealedSecret(result.signing_secret);
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

  async function handleReactivateKey(keyId: string): Promise<void> {
    await reactivateKeyMutation.mutateAsync(keyId);
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

  if (endpointsQuery.error) {
    return (
      <InfoCard
        buttons={{
          primary: {
            href: "/webhooks",
            label: "Back to webhooks",
          },
        }}
        colour="red"
        footer={false}
        header={{
          title: "Error",
          description: "Failed to load webhook endpoint",
        }}
        message={{
          title: "Webhook endpoint unavailable",
          description: getErrorMessage(
            endpointsQuery.error,
            "Failed to load webhook endpoint."
          ),
        }}
      />
    );
  }

  if (!endpoint) {
    return (
      <InfoCard
        buttons={{
          primary: {
            href: "/webhooks",
            label: "Back to webhooks",
          },
        }}
        colour="red"
        footer={false}
        header={{
          title: "Not Found",
          description: "Webhook endpoint not found",
        }}
        message={{
          title: "Endpoint not found",
          description:
            "The webhook endpoint you're looking for doesn't exist or is no longer available.",
        }}
      />
    );
  }

  const isEndpointMutating =
    updateEndpointMutation.isPending || deleteEndpointMutation.isPending;

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 grow flex-col">
      <div className="space-y-6">
        <Link
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
          to="/webhooks"
        >
          <ChevronLeftIcon className="size-4" />
          Back to webhooks
        </Link>

        <div className="flex flex-col gap-4 border-border/70 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-light text-3xl text-foreground tracking-tight">
                {getEndpointPageTitle(endpoint)}
              </h1>
              <StatusBadge status={endpoint.enabled ? "active" : "disabled"} />
            </div>
            <p className="break-all text-muted-foreground text-sm">
              {getEndpointPageSubtitle(endpoint)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <EditEndpointDrawer
              endpointEnabled={endpointEnabled}
              endpointName={endpointName}
              endpointSubscribedEventTypes={endpointSubscribedEventTypes}
              endpointUrl={endpointUrl}
              isDirty={isEndpointDirty}
              isSaving={updateEndpointMutation.isPending}
              onEndpointEnabledChange={setEndpointEnabled}
              onEndpointNameChange={setEndpointName}
              onEndpointUrlChange={setEndpointUrl}
              onReset={resetEndpointDraft}
              onSaveEndpoint={handleSaveEndpoint}
              onToggleEndpointEventType={(eventType) =>
                setEndpointSubscribedEventTypes((currentValue) =>
                  toggleEventSelection(currentValue, eventType)
                )
              }
            />
            <EndpointActionsMenu
              endpoint={endpoint}
              isMutating={isEndpointMutating}
              onDeleteEndpoint={handleDeleteEndpoint}
              onToggleEndpointEnabled={handleToggleEndpointEnabled}
              showViewDetails={false}
              triggerVariant="ghost"
            />
          </div>
        </div>

        <Tabs
          className="gap-6"
          onValueChange={(value) => setActiveTab(value as EndpointDetailTab)}
          value={activeTab}
        >
          <TabsList
            className="h-auto w-full justify-start gap-5 rounded-none bg-transparent p-0"
            variant="line"
          >
            <TabsTrigger
              className="h-10 flex-none rounded-none px-0 pb-2 data-active:bg-transparent"
              value="overview"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              className="h-10 flex-none rounded-none px-0 pb-2 data-active:bg-transparent"
              value="performance"
            >
              Performance
            </TabsTrigger>
            <TabsTrigger
              className="h-10 flex-none rounded-none px-0 pb-2 data-active:bg-transparent"
              value="deliveries"
            >
              Event deliveries
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6" value="overview">
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

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
              <div className="space-y-6">
                <EndpointDetailsPanel endpoint={endpoint} />
                <EndpointResourcesCard />
              </div>

              <div className="space-y-6">
                <EndpointSigningSecretCard
                  isRevealing={revealSecretMutation.isPending}
                  isRotating={rotateSecretMutation.isPending}
                  onRevealSecret={handleRevealSecret}
                  onRotateSecret={handleRotateSecret}
                  secret={revealedSecret}
                />
                <EndpointKeysCard
                  endpointId={endpoint.id}
                  error={keysQuery.error}
                  isLoading={keysQuery.isLoading}
                  isUpdating={
                    deactivateKeyMutation.isPending ||
                    reactivateKeyMutation.isPending
                  }
                  keys={keys}
                  onCreateKey={handleCreateKey}
                  onDeactivateKey={handleDeactivateKey}
                  onReactivateKey={handleReactivateKey}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent className="space-y-6" value="performance">
            <QueryErrorAlert
              error={deliveriesQuery.error}
              fallback="Endpoint deliveries could not be loaded."
              title="Failed to load endpoint deliveries"
            />

            <EndpointPerformancePanel
              endpointDeliveryStats={endpointDeliveryStats}
              isDeliveriesLoading={deliveriesQuery.isLoading}
              trendPoints={endpointDeliveryTrend}
            />
          </TabsContent>

          <TabsContent className="space-y-4" value="deliveries">
            <DeliveriesTabContent
              context="endpoint"
              deliveries={endpointDeliveries}
              error={deliveriesQuery.error}
              isLoading={deliveriesQuery.isLoading}
              isRetrying={retryDeliveryMutation.isPending}
              onRetryDelivery={handleRetryDelivery}
            />
          </TabsContent>
        </Tabs>
      </div>
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

function CreateEndpointDrawer({
  onSubmit,
}: {
  onSubmit: (
    input: CreateEndpointSubmission
  ) => Promise<CreateEndpointSubmissionResult>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [environment, setEnvironment] = useState<Environment>("live");
  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([
    ...SUPPORTED_WEBHOOK_EVENT_TYPES,
  ]);
  const [shouldConfigurePublicKey, setShouldConfigurePublicKey] =
    useState(false);
  const [publicKeyId, setPublicKeyId] = useState("");
  const [publicKeyInput, setPublicKeyInput] = useState("");
  const [url, setUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function resetState() {
    setIsSubmitting(false);
    setIsMoreOptionsOpen(false);
    setEnvironment("live");
    setEnabled(true);
    setName("");
    setSelectedEventTypes([...SUPPORTED_WEBHOOK_EVENT_TYPES]);
    setShouldConfigurePublicKey(false);
    setPublicKeyId("");
    setPublicKeyInput("");
    setUrl("");
    setErrorMessage("");
  }

  async function handleSubmit() {
    setErrorMessage("");

    try {
      if (!url.trim()) {
        throw new Error("Webhook URL is required.");
      }

      if (selectedEventTypes.length === 0) {
        throw new Error("Select at least one event type.");
      }

      setIsSubmitting(true);
      const result = await onSubmit({
        enabled,
        environment,
        initialPublicKey: getCreateEndpointInitialPublicKey({
          publicKeyId,
          publicKeyInput,
          shouldConfigurePublicKey,
        }),
        name: name.trim() || null,
        subscribedEventTypes: selectedEventTypes,
        url: url.trim(),
      });

      setIsOpen(false);
      resetState();
      toast.success("Webhook endpoint created");

      if (result.publicKeyError) {
        toast.error(result.publicKeyError);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to create webhook endpoint."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          resetState();
        }
      }}
      open={isOpen}
    >
      <SheetTrigger
        render={
          <Button onClick={() => setIsOpen(true)}>
            <PlusIcon className="mr-2 size-4" />
            Create endpoint
          </Button>
        }
      />
      <SheetContent
        className="flex w-full flex-col overflow-hidden sm:max-w-2xl"
        side="right"
      >
        <div className="border-border/70 border-b px-6 py-5">
          <SheetTitle>Create webhook endpoint</SheetTitle>
          <p className="mt-1 text-muted-foreground text-sm">
            Configure the destination, subscribed events, and active encryption
            key from one surface.
          </p>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to create endpoint</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="create-webhook-name">Endpoint name</Label>
            <Input
              id="create-webhook-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Primary production webhook"
              value={name}
            />
          </div>

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
                  className="capitalize"
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

          <div className="space-y-2">
            <Label>Event subscriptions</Label>
            <EventSubscriptionMenu
              onToggleEventType={(eventType) =>
                setSelectedEventTypes((currentValue) =>
                  toggleEventSelection(currentValue, eventType)
                )
              }
              selectedEventTypes={selectedEventTypes}
            />
          </div>

          <div className="overflow-hidden rounded-md border border-border/70">
            <button
              aria-controls="create-endpoint-more-options"
              aria-expanded={isMoreOptionsOpen}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
              onClick={() =>
                setIsMoreOptionsOpen((currentValue) => !currentValue)
              }
              type="button"
            >
              <div className="space-y-0.5">
                <div className="font-medium text-sm">More options</div>
                <p className="text-muted-foreground text-sm">
                  Enabled state and initial public key configuration.
                </p>
              </div>
              <ChevronDownIcon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  isMoreOptionsOpen ? "rotate-180" : undefined
                )}
              />
            </button>

            {isMoreOptionsOpen ? (
              <div
                className="space-y-4 border-border/70 border-t px-4 py-4"
                id="create-endpoint-more-options"
              >
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

                <div className="space-y-3 border-border/70 border-t pt-4">
                  <div className="flex items-center justify-between gap-6">
                    <div className="space-y-0.5">
                      <Label htmlFor="create-endpoint-public-key">
                        Configure public key
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        Add the initial active encryption key now so new
                        deliveries do not fail for missing key material.
                      </p>
                    </div>
                    <Switch
                      checked={shouldConfigurePublicKey}
                      id="create-endpoint-public-key"
                      onCheckedChange={setShouldConfigurePublicKey}
                    />
                  </div>

                  {shouldConfigurePublicKey ? (
                    <PublicKeyFields
                      jwkInput={publicKeyInput}
                      jwkInputId="create-endpoint-jwk"
                      keyId={publicKeyId}
                      keyIdId="create-endpoint-key-id"
                      onJwkInputChange={setPublicKeyInput}
                      onKeyIdChange={setPublicKeyId}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-border/70 border-t px-6 py-4">
          <Button
            onClick={() => setIsOpen(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} type="button">
            {isSubmitting ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : null}
            Create endpoint
          </Button>
        </div>
      </SheetContent>
    </Sheet>
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

          <PublicKeyFields
            jwkInput={jwkInput}
            jwkInputId="create-key-jwk"
            keyId={keyId}
            keyIdId="create-key-id"
            onJwkInputChange={(value) => {
              setJwkInput(value);
              setErrorMessage("");
            }}
            onKeyIdChange={(value) => {
              setKeyId(value);
              setErrorMessage("");
            }}
          />
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
