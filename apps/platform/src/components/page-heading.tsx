import { Button } from "@kayleai/ui/button";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react/jsx-runtime";
import type { FileRoutesByTo } from "@/routeTree.gen";

type PageHeadingAction = {
  to: keyof FileRoutesByTo;
  label: string;
  variant?: "default" | "outline";
};

type PageHeadingProps = {
  title: string;
  description?: string;
  quote?: string;
  actions?: PageHeadingAction[];
};

export function PageHeading({
  title,
  description,
  quote,
  actions,
}: PageHeadingProps) {
  return (
    <div className="mb-16">
      <div className="max-w-3xl">
        <h1 className="mb-6 text-balance font-light text-7xl text-neutral-950 tracking-tighter">
          {title}
        </h1>
        {description && (
          <p className="mb-12 text-balance font-medium text-2xl text-neutral-600">
            {description.split("\n").map((line) => (
              <Fragment key={line}>
                {line}
                <br />
              </Fragment>
            ))}
          </p>
        )}
        {actions && actions.length > 0 && (
          <div className="flex gap-4">
            {actions.map((action) => (
              <Button
                key={action.to}
                render={<Link to={action.to}>{action.label}</Link>}
                variant={action.variant ?? "default"}
              />
            ))}
          </div>
        )}
      </div>
      {quote && (
        <blockquote className="mt-12 max-w-2xl text-balance font-light text-2xl text-neutral-500 italic">
          “{quote}”
        </blockquote>
      )}
    </div>
  );
}
