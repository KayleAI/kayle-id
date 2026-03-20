import { ERROR_MESSAGES } from "@kayle-id/config/error-messages";
import { Layout } from "@kayleai/ui/layout";
import type { NotFoundRouteProps } from "@tanstack/react-router";
import InfoCard from "./info";

/**
 * The not found component.
 *
 * This component is reserved only for when a session is not found, has expired, or is otherwise invalid.
 *
 * This informs the user that it's an issue on their end.
 *
 * @note Not to be confused with the error page which is reserved for when issues occur on our end.
 *
 * @returns A not found component.
 */
type InvalidSessionData = {
  data?: {
    type?: string;
  };
};

function isInvalidSessionData(data: unknown): data is InvalidSessionData {
  return typeof data === "object" && data !== null && "data" in data;
}

export function NotFound({ data }: NotFoundRouteProps) {
  const invalidData = isInvalidSessionData(data) ? data : undefined;

  if (invalidData?.data?.type === "invalid_session_id") {
    const errorMessage = ERROR_MESSAGES.INVALID_SESSION_ID;
    return (
      <InfoCard
        buttons={{
          primary: {
            label: "Go back to the previous page",
            onClick: () => window.history.back(),
          },
        }}
        colour="red"
        header={{
          title: errorMessage.title,
          description: errorMessage.description,
        }}
        message={{
          title: errorMessage.title,
          description: errorMessage.description,
        }}
      />
    );
  }

  // Generic not found page
  return (
    <Layout>
      <InfoCard
        colour="red"
        header={{
          title: "Page Not Found",
          description: "The page you are looking for does not exist.",
        }}
        message={{
          title: "We couldn't find the page you were looking for",
          description: "Please check the URL you followed and try again.",
        }}
      />
    </Layout>
  );
}
