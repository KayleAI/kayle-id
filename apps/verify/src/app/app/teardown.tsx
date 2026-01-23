import { useEffect, useState } from "react";
import InfoCard from "@/components/info";

type TeardownProps = {
  redirectUrl?: string | null;
};

/**
 * Final component shown after verification is complete.
 * Handles redirect to the original site if configured.
 */
export function Teardown({ redirectUrl }: TeardownProps) {
  const [countdown, setCountdown] = useState(redirectUrl ? 5 : null);

  // Handle redirect countdown
  useEffect(() => {
    if (!redirectUrl || countdown === null) {
      return;
    }

    if (countdown === 0) {
      window.location.href = redirectUrl;
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, redirectUrl]);

  return (
    <InfoCard
      buttons={{
        primary: redirectUrl
          ? {
              label: `Return to site${countdown !== null ? ` (${countdown})` : ""}`,
              onClick: () => {
                window.location.href = redirectUrl;
              },
            }
          : {
              label: "Close",
              onClick: () => window.close(),
            },
      }}
      colour="emerald"
      footer={true}
      header={{
        title: "Verification Complete",
        description: "Your identity has been successfully verified.",
      }}
      message={{
        title: "Thank you!",
        description: redirectUrl
          ? `You will be redirected automatically in ${countdown ?? 0} seconds.`
          : "You can now close this page.",
      }}
    />
  );
}
