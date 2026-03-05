import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kayleai/ui/dialog";
import { useLoaderData } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import InfoCard from "@/components/info";

/**
 * This component is used to inform the user that their device is not supported for Identity Verification with Kayle ID.
 *
 * It provides a QR code for the user to scan to open the session on a mobile device.
 */
export function UnsupportedDevice() {
  const [unsupportedDeviceDialogOpen, setUnsupportedDeviceDialogOpen] =
    useState(false);
  const { sessionId } = useLoaderData({
    from: "/$",
  });

  const qrPayload = `kayle-id://${JSON.stringify({
    session_id: sessionId,
    attempt_id: "",
    mobile_write_token: "",
  })}`;

  return (
    <>
      <InfoCard
        buttons={{
          primary: {
            label: "Open on Mobile",
            onClick: () => {
              setUnsupportedDeviceDialogOpen(true);
            },
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
          <div className="flex justify-center py-4">
            <QRCodeSVG
              bgColor="transparent"
              fgColor="currentColor"
              level="M"
              size={200}
              value={qrPayload}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
