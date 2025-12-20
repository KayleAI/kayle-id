import type { ApiKey } from "@kayle-id/auth/types";
import { Alert, AlertDescription, AlertTitle } from "@kayleai/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@kayleai/ui/alert-dialog";
import { Badge } from "@kayleai/ui/badge";
import { Button } from "@kayleai/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@kayleai/ui/card";
import { Input } from "@kayleai/ui/input";
import { Label } from "@kayleai/ui/label";
import { Separator } from "@kayleai/ui/separator";
import { Switch } from "@kayleai/ui/switch";
import { cn } from "@kayleai/ui/utils/cn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppHeading } from "@/components/app-heading";
import { formatDate } from "@/utils/format-date";

export function ApiKeyComponent({ apiKey }: { apiKey: ApiKey }) {
  const [name, setName] = useState(apiKey.name);
  const [enabled, setEnabled] = useState(apiKey.enabled);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const updateMutation = useMutation({
    mutationFn: async ({
      name: newName,
      enabled: newEnabled,
    }: {
      name?: string;
      enabled?: boolean;
    }) => {
      const response = await fetch(`/api/auth/api-keys/${apiKey.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newName ?? apiKey.name,
          enabled: newEnabled ?? apiKey.enabled,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({
          error: null,
        }))) as { error?: { message?: string } } | null;
        throw new Error(
          errorData?.error?.message ?? "Failed to update API key"
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setIsEditingName(false);
      setErrorMessage("");
    },
    onError: (err) => {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to update API key"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/auth/api-keys/${apiKey.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({
          error: null,
        }))) as { error?: { message?: string } } | null;
        throw new Error(
          errorData?.error?.message ?? "Failed to delete API key"
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      navigate({ to: "/api-keys" });
    },
    onError: (err) => {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to delete API key"
      );
      setIsDeleteDialogOpen(false);
    },
  });

  const handleSaveName = () => {
    if (!name.trim()) {
      setErrorMessage("Name cannot be empty");
      return;
    }
    updateMutation.mutate({ name: name.trim() });
  };

  const handleCancelEdit = () => {
    setName(apiKey.name);
    setIsEditingName(false);
    setErrorMessage("");
  };

  const handleToggleEnabled = (checked: boolean) => {
    setEnabled(checked);
    updateMutation.mutate({ enabled: checked });
  };

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-1 grow flex-col">
      <AppHeading
        button={
          <Badge
            className={cn(
              "px-3! py-3! text-xs",
              enabled
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                : "border-red-500/20 bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400"
            )}
            variant="outline"
          >
            {enabled ? "Enabled" : "Disabled"}
          </Badge>
        }
        description="View and manage your API key"
        title={apiKey.name}
      />
      <hr className="my-8" />

      {errorMessage && (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>API key information and settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <div className="flex items-center gap-2">
                <Input
                  disabled={!isEditingName || updateMutation.isPending}
                  id="name"
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrorMessage("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && isEditingName) {
                      handleSaveName();
                    }
                    if (e.key === "Escape") {
                      handleCancelEdit();
                    }
                  }}
                  value={name}
                />
                {isEditingName ? (
                  <div className="flex gap-2">
                    <Button
                      disabled={updateMutation.isPending}
                      onClick={handleSaveName}
                      size="sm"
                      type="button"
                    >
                      Save
                    </Button>
                    <Button
                      disabled={updateMutation.isPending}
                      onClick={handleCancelEdit}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setIsEditingName(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enabled">Status</Label>
                <p className="text-muted-foreground text-sm">
                  {enabled
                    ? "This API key is active and can be used for requests"
                    : "This API key is disabled and cannot be used"}
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={updateMutation.isPending}
                id="enabled"
                onCheckedChange={handleToggleEnabled}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">
                  Request Count
                </Label>
                <p className="font-medium">
                  {apiKey.requestCount.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">Created</Label>
                <p className="font-medium">{formatDate(apiKey.createdAt)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">
                  Last Updated
                </Label>
                <p className="font-medium">{formatDate(apiKey.updatedAt)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">Key ID</Label>
                <p className="font-medium font-mono text-sm">{apiKey.id}</p>
              </div>
            </div>

            {apiKey.permissions.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <div className="flex flex-wrap gap-2">
                    {apiKey.permissions.map((permission) => (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-1 font-medium text-xs",
                          "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                        )}
                        key={permission}
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {Object.keys(apiKey.metadata).length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Metadata</Label>
                  <pre className="rounded-md bg-muted p-4 text-sm">
                    {JSON.stringify(apiKey.metadata, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Delete API Key</Label>
                <p className="text-muted-foreground text-sm">
                  Once deleted, this API key cannot be recovered
                </p>
              </div>
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => setIsDeleteDialogOpen(true)}
                type="button"
                variant="destructive"
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        onOpenChange={setIsDeleteDialogOpen}
        open={isDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the API key{" "}
              <span className="font-semibold text-foreground">
                “{apiKey.name}”
              </span>
              . This action cannot be undone and any request using this API key
              will fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteMutation.isPending}
              variant="secondary"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={handleDelete}
              variant="destructive"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
