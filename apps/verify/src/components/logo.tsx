import clsx from "clsx";

export function Logo({
  className,
  variant = "default",
}: Readonly<{
  className?: string;
  variant?: "default" | "small";
}>) {
  return (
    <div className={clsx("relative isolate flex items-center", className)}>
      <Logomark className="size-6" />
      <span
        className={clsx(
          "ml-2 select-none font-medium tracking-tight",
          variant === "small" && "text-lg",
          variant === "default" && "text-xl"
        )}
      >
        Kayle ID
      </span>
    </div>
  );
}

export function Logomark({
  className,
}: Readonly<{
  className?: string;
}>) {
  return (
    <svg
      className={className}
      height="24"
      viewBox="0 0 41.8 39.4"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{/* noop */}</title>
      <g
        fill="currentColor"
        fillRule="evenodd"
        id="kayle-icon"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="0mm"
      >
        <path d="M 0 15.9 L 2.5 9.3 L 15.2 13.6 C 16.5 14.1 17.1 15.6 17.9 16.7 L 19.3 15.7 C 18.5 14.6 17.3 13.4 17.3 12.1 C 17.3 12.1 17.2 0 17.2 0 L 24.2 0 C 24.2 0 24.5 12.1 24.5 12.1 C 24.5 13.4 23.3 14.6 22.5 15.7 L 23.9 16.7 C 24.7 15.6 25.4 14.1 26.6 13.6 L 39.3 9.3 C 39.3 9.3 41.8 15.9 41.8 15.9 L 28.1 21.1 C 26.9 21.6 25.4 20.8 24.1 20.4 C 24.1 20.4 23.6 22.1 23.6 22.1 C 24.9 22.5 26.6 22.6 27.4 23.7 C 27.4 23.7 36.2 35.2 36.2 35.2 C 36.2 35.2 30.6 39.4 30.6 39.4 C 30.6 39.4 22.3 29.2 22.3 29.2 C 21.5 28.2 21.8 26.6 21.8 25.2 L 20 25.2 C 20 26.6 20.3 28.2 19.5 29.2 L 11.3 39.4 C 11.3 39.4 5.7 35.2 5.7 35.2 C 5.7 35.2 14.5 23.7 14.5 23.7 C 15.3 22.6 17 22.5 18.2 22.1 C 18.2 22.1 17.8 20.4 17.8 20.4 C 16.5 20.8 15 21.6 13.7 21.1 L 0 15.9 Z" />
      </g>
    </svg>
  );
}
