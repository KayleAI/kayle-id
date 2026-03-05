import { Layout } from "@kayleai/ui/layout";
import type { NotFoundRouteProps } from "@tanstack/react-router";
import InfoCard from "./info";

/**
 * The not found component.
 *
 * @returns A not found component.
 */
export function NotFound(_props: NotFoundRouteProps) {
  return (
    <Layout>
      <InfoCard
        buttons={{
          primary: {
            label: "Go back to the previous page",
            onClick: () => window.history.back(),
          },
          secondary: {
            label: "Go to the home page",
            href: "/",
          },
        }}
        colour="red"
        footer={false}
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
