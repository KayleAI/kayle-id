import { createRouter, type NotFoundRouteProps } from "@tanstack/react-router";
import { NotFound } from "./components/not-found";
import { routeTree } from "./routeTree.gen";

function defaultNotFoundComponent(props: NotFoundRouteProps): React.ReactNode {
  return <NotFound {...props} />;
}

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    defaultNotFoundComponent,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
