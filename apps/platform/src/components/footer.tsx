import { Logo } from "@kayleai/ui/logo";
import { cn } from "@kayleai/ui/utils/cn";
import { Link } from "@tanstack/react-router";
import { DiscordIcon } from "@/icons/discord";
import { GithubIcon } from "@/icons/github";
import { LinkedInIcon } from "@/icons/linkedin";
import { TwitterIcon } from "@/icons/twitter";
import type { FileRoutesByTo } from "@/routeTree.gen";

type FooterColumnProps = {
  title: string;
  links: Array<{
    label: string;
    to: keyof FileRoutesByTo | string;
  }>;
};

const columns: FooterColumnProps[] = [
  {
    title: "Product",
    links: [
      { label: "API Reference", to: "/api-reference" },
      { label: "Documentation", to: "/docs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Blog", to: "https://kayle.ai/blog" },
      { label: "Company", to: "https://kayle.ai/company" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
    ],
  },
];

function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <h4 className="mb-4 font-medium text-neutral-900 text-sm">{title}</h4>
      <ul className="space-y-3">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              className="text-neutral-500 text-sm transition-colors hover:text-neutral-900"
              to={link.to}
              {...(link.to.startsWith("https://")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer({ className }: { readonly className?: string }) {
  return (
    <footer
      className={cn(
        "border-neutral-100 border-t",
        "mx-auto max-w-7xl",
        "px-6 py-6 lg:px-8",
        className
      )}
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4 md:gap-8">
          <div>
            <Link to="/">
              <Logo title="Kayle ID" variant="small" />
            </Link>
            <p className="mt-3 max-w-xs text-balance text-neutral-500 text-sm leading-relaxed">
              Primitives for Identity Verification
            </p>
          </div>
          {columns.map((column) => (
            <FooterColumn key={column.title} {...column} />
          ))}
        </div>

        <div className="mt-20 flex flex-col justify-between gap-3 border-neutral-100 border-t pt-8 md:flex-row md:items-center">
          <p className="order-last text-neutral-500 text-sm md:order-first">
            © {new Date().getFullYear()} ID by{" "}
            <a
              className="font-semibold text-neutral-700 underline decoration-dashed underline-offset-2 transition-colors hover:text-neutral-950"
              href="https://kayle.ai"
              rel="noopener noreferrer"
              target="_blank"
            >
              Kayle Inc.
            </a>{" "}
            All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a
              className="text-neutral-400 transition-colors hover:text-neutral-900"
              href="https://go.kayle.ai/discord"
              rel="noopener noreferrer"
              target="_blank"
            >
              <DiscordIcon className="size-4" />
            </a>
            <a
              className="text-neutral-400 transition-colors hover:text-neutral-900"
              href="https://go.kayle.ai/linkedin"
              rel="noopener noreferrer"
              target="_blank"
            >
              <LinkedInIcon className="size-4" />
            </a>
            <a
              className="text-neutral-400 transition-colors hover:text-neutral-900"
              href="https://git.new/kayle"
              rel="noopener noreferrer"
              target="_blank"
            >
              <GithubIcon className="size-4" />
            </a>
            <a
              className="text-neutral-400 transition-colors hover:text-neutral-900"
              href="https://go.kayle.ai/x"
              rel="noopener noreferrer"
              target="_blank"
            >
              <TwitterIcon className="size-4" />
            </a>
          </div>
        </div>
        <div className="mask-[linear-gradient(to_bottom,white_0%,transparent)] select-none overflow-hidden">
          <div className="-ml-2 -mb-6 whitespace-nowrap text-9xl text-transparent leading-[100%] [text-shadow:1px_1px_1px_rgba(255,255,255,.1),-1px_-1px_1px_rgba(0,0,0,.5),-40px_-40px_0px_rgba(0,0,0,0)] sm:text-[12rem]">
            <div>Kayle ID.</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
