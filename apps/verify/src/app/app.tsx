import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kayleai/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";
import InfoCard from "@/components/info";
import { isSupportedDevice } from "@/utils/is-supported-device";
import { useSession } from "./session-provider";

export function SessionApp() {
  const { session } = useSession();
  const [unsupportedDeviceDialogOpen, setUnsupportedDeviceDialogOpen] =
    useState(false);
  const deviceSupported = useMemo(() => isSupportedDevice(), []);

  const notifyUnsupportedDevice = useCallback(async () => {
    if (!session) {
      return;
    }

    await session.notifyUnsupportedDevice();
  }, [session]);

  useEffect(() => {
    if (!deviceSupported && session) {
      notifyUnsupportedDevice();
    }
  }, [session, deviceSupported, notifyUnsupportedDevice]);

  if (!session) {
    return null;
  }

  if (!deviceSupported) {
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
              <DialogTitle>
                Scan this QR code with your mobile device
              </DialogTitle>
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
                value={window.location.href}
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // TODO: Implement the main verification flow.

  return (
    <InfoCard
      buttons={{
        primary: {
          label: "Continue",
          onClick: () => window.location.reload(),
        },
      }}
      colour="emerald"
      footer={true}
      header={{
        title: "Verification Complete",
        description: "You have successfully verified your identity.",
      }}
      message={{
        title: "Thank you for verifying your identity",
        description: "You can now close this page.",
      }}
    />
  );
}
