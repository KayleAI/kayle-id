import { cn } from "@kayleai/ui/utils/cn";

export function AppHeading({
  title,
  description,
  button,
  className,
}: {
  title: string;
  description?: string;
  button?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col justify-between sm:flex-row sm:items-center">
      <div className={cn("flex flex-col", className)}>
        <h1 className="mb-1 font-light text-3xl text-foreground tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-lg text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {button ? (
        <div className="mt-6 flex justify-end sm:mt-0">{button}</div>
      ) : null}
    </div>
  );
}
