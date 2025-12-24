import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import InfoCard from "@/components/info";
import { useSession } from "./session-provider";

export function SessionError() {
  const { error } = useSession();

  if (!error) {
    return null;
  }

  const errorMessage =
    ERROR_MESSAGES[error.code as keyof typeof ERROR_MESSAGES] ??
    ERROR_MESSAGES.UNKNOWN;

  return (
    <InfoCard
      colour="red"
      header={{
        title: "Session Error",
        description: "An error occurred while loading the session.",
      }}
      message={{
        title: errorMessage.title,
        description: errorMessage.description,
      }}
    />
  );
}
