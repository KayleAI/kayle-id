import { useAuth } from "@kayle-id/auth/client/provider";
import type { ApiKey } from "@kayle-id/auth/types";
import { Alert, AlertDescription, AlertTitle } from "@kayleai/ui/alert";
import { Button } from "@kayleai/ui/button";
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
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatDate } from "@/utils/format-date";

export function ApiKeysTable({ apiKeys }: { apiKeys: ApiKey[] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requests</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.map((key) => (
            <TableRow key={key.id}>
              <TableCell className="font-medium">
                <Link
                  className="hover:underline"
                  params={{ key: key.id }}
                  to="/api-keys/$key"
                >
                  {key.name}
                </Link>
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 font-medium text-xs",
                    key.enabled
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {key.enabled ? "Enabled" : "Disabled"}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {key.requestCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(key.createdAt)}
              </TableCell>
            </TableRow>
          ))}
          {apiKeys.length === 0 ? (
            <TableRow>
              <TableCell className="text-center" colSpan={4}>
                No API keys found
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

export function CreateApiKey() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const { session } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  // Reset form when dialog closes after success
  useEffect(() => {
    if (!isOpen && status === "success") {
      // Small delay to allow dialog close animation
      const timer = setTimeout(() => {
        setStatus("idle");
        setName("");
        setApiKey(null);
        setErrorMessage("");
        setCopied(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, status]);

  const handleCreateApiKey = async () => {
    // Validate form
    if (!name.trim()) {
      setStatus("error");
      setErrorMessage("Please enter a name for your API key");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          organizationId: session?.activeOrganizationId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({
          error: null,
        }))) as { error?: { message?: string } } | null;
        setStatus("error");
        setErrorMessage(
          errorData?.error?.message ??
            "Failed to create API key. Please try again."
        );
        return;
      }

      const data: { data: { key: string } } = await response.json();
      const key = data.data?.key;

      if (!key) {
        setStatus("error");
        setErrorMessage("API key was not returned. Please try again.");
        return;
      }

      setApiKey(key);
      setStatus("success");
      // Invalidate API keys query to refresh the list
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to create API key. Please try again."
      );
    }
  };

  const handleCopy = async () => {
    if (!apiKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = apiKey;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Copy failed
      }
      document.body.removeChild(textarea);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsOpen(open);
    // Reset error state when dialog is manually closed
    if (!open && status === "error") {
      setStatus("idle");
      setErrorMessage("");
    }
  };

  return (
    <div className="contents">
      <Dialog onOpenChange={handleDialogClose} open={isOpen}>
        <DialogTrigger
          render={
            <Button onClick={() => setIsOpen(true)}>Create API Key</Button>
          }
        />
        <DialogContent className="flex w-full max-w-lg! flex-col">
          {status === "success" ? (
            <>
              <DialogHeader>
                <DialogTitle>API Key Created</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label className="font-medium text-sm" htmlFor="api-key">
                  Your API Key
                </Label>
                <div className="relative">
                  <Textarea
                    className="min-h-[0px]! resize-none pr-20 font-mono text-sm"
                    id="api-key"
                    readOnly
                    value={apiKey ?? ""}
                  />
                  <Button
                    className="-translate-y-1/2 absolute top-1/2 right-2"
                    onClick={handleCopy}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  You won't be able to view this API key again.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setIsOpen(false)}>
                  I've saved my API key
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {status === "error" && errorMessage && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    disabled={status === "loading"}
                    id="name"
                    onChange={(e) => {
                      setName(e.target.value);
                      // Clear error when user starts typing
                      if (status === "error") {
                        setStatus("idle");
                        setErrorMessage("");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && name.trim()) {
                        handleCreateApiKey();
                      }
                    }}
                    placeholder="API Key Name"
                    value={name}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={status === "loading" || !name.trim()}
                  onClick={handleCreateApiKey}
                >
                  {status === "loading" ? "Creating..." : "Create API Key"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
