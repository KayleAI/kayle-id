import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kayleai/ui/dialog";
import { useLoaderData } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useMemo, useState } from "react";
import InfoCard from "@/components/info";
import type { HandoffPayload } from "@/config/handoff";
import { requestHandoffPayload } from "@/config/handoff";
import { useDevice } from "@/utils/use-device";

function buildHandoffUrl(payload: HandoffPayload): string {
  return `kayle-id://${encodeURIComponent(JSON.stringify(payload))}`;
}

/**
 * This component is used to inform the user that their device is not supported for Identity Verification with Kayle ID.
 *
 * It provides a QR code for the user to scan to open the session on a mobile device.
 */
export function UnsupportedDevice() {
  const { os } = useDevice();
  const [unsupportedDeviceDialogOpen, setUnsupportedDeviceDialogOpen] =
    useState(false);
  const [handoffPayload, setHandoffPayload] = useState<HandoffPayload | null>(
    null
  );
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const { sessionId } = useLoaderData({
    from: "/$",
  });

  const handoffUrl = useMemo(
    () => (handoffPayload ? buildHandoffUrl(handoffPayload) : null),
    [handoffPayload]
  );

  const fetchHandoffPayload = useCallback(async () => {
    setHandoffLoading(true);
    setHandoffError(null);
    setHandoffPayload(null);

    try {
      const payload = await requestHandoffPayload(sessionId);
      setHandoffPayload(payload);
    } catch {
      setHandoffError("Unable to generate handoff QR code.");
    } finally {
      setHandoffLoading(false);
    }
  }, [sessionId]);

  const openMobileDialog = () => {
    setUnsupportedDeviceDialogOpen(true);
    fetchHandoffPayload();
  };

  return (
    <>
      <InfoCard
        buttons={{
          primary: {
            label: "Open on Mobile",
            onClick: openMobileDialog,
          },
          secondary: {
            label: "Go back to the previous page",
            onClick: () => window.history.back(),
          },
        }}
        colour="blue"
        footer={false}
        header={{
          title: "Unsupported Device",
          description: "You cannot use this device to verify your identity.",
        }}
        message={{
          title: "Switch to a Mobile Device",
          description:
            "Only mobile devices are supported for identity verification.",
        }}
      />
      <Dialog
        onOpenChange={setUnsupportedDeviceDialogOpen}
        open={unsupportedDeviceDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan this QR code with your mobile device</DialogTitle>
            <DialogDescription>
              You can scan this QR code with your mobile device to open the
              verification in the app.
            </DialogDescription>
          </DialogHeader>
          {handoffLoading ? (
            <p className="py-4 text-center text-muted-foreground text-sm">
              Generating a secure handoff QR code...
            </p>
          ) : null}

          {!handoffLoading && handoffError ? (
            <div className="space-y-4 py-2">
              <p className="text-center text-red-600 text-sm">{handoffError}</p>
              <button
                className="w-full rounded-md border px-4 py-2 text-sm"
                onClick={() => {
                  fetchHandoffPayload();
                }}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : null}

          {!(handoffLoading || handoffError) && handoffUrl ? (
            <div className="space-y-4 py-2">
              {os === "ios" ? (
                <a
                  className="block w-full rounded-md bg-black px-4 py-2 text-center text-sm text-white"
                  href={handoffUrl}
                >
                  Open Kayle ID app
                </a>
              ) : null}
              <div className="flex justify-center">
                <QRCodeSVG
                  bgColor="transparent"
                  fgColor="currentColor"
                  level="M"
                  size={200}
                  value={handoffUrl}
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
