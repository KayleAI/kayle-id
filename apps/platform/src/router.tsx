import { createRouter, type NotFoundRouteProps } from "@tanstack/react-router";
import { NotFound } from "./components/not-found";
import { routeTree } from "./routeTree.gen";

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    defaultNotFoundComponent: NotFound as unknown as (
      props: NotFoundRouteProps
    ) => React.ReactNode,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    trailingSlash: "never",
  });

  return router;
};
