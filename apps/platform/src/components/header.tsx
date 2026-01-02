"use client";

import { useAuth } from "@kayle-id/auth/client/provider";
import { Button } from "@kayleai/ui/button";
import { Logo } from "@kayleai/ui/logo";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@kayleai/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@kayleai/ui/sheet";
import { cn } from "@kayleai/ui/utils/cn";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FileRoutesByTo } from "@/routeTree.gen";

const navigationItems: {
  section: string;
  items: { to: keyof FileRoutesByTo; label: string; description: string }[];
}[] = [
  {
    section: "Company",
    items: [],
  },
];

type NavItemProps = {
  to: keyof FileRoutesByTo;
  children: React.ReactNode;
  variant?: "default" | "button";
  className?: string;
};

function NavItem({
  to,
  children,
  variant = "default",
  className,
}: NavItemProps) {
  if (variant === "button") {
    return (
      <Button
        className={cn(className)}
        nativeButton={false}
        render={<Link to={to}>{children}</Link>}
        variant="default"
      />
    );
  }

  return (
    <Link
      className="font-medium text-neutral-600 text-sm transition-colors duration-200 hover:text-neutral-900"
      to={to}
    >
      {children}
    </Link>
  );
}

const ListItem = ({
  ref,
  className,
  title,
  children,
  to,
  ...props
}: {
  ref?: React.RefObject<HTMLAnchorElement>;
  className?: string;
  title: string;
  children: React.ReactNode;
  to: keyof FileRoutesByTo;
  props?: React.ComponentPropsWithoutRef<"a">;
}) => {
  if (!to) {
    return null;
  }

  return (
    <li>
      <NavigationMenuLink
        render={() => (
          <Link
            className={cn(
              "block select-none space-y-1 rounded-md p-3 font-medium leading-none no-underline outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-900",
              className
            )}
            ref={ref}
            to={to}
            {...props}
          >
            <div className="font-medium text-sm leading-none">{title}</div>
            <p className="line-clamp-2 text-neutral-500 text-sm leading-snug">
              {children}
            </p>
          </Link>
        )}
      />
    </li>
  );
};

function MobileNavItem({
  to,
  children,
}: {
  to: keyof FileRoutesByTo;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="block text-lg text-neutral-600 transition-colors hover:text-neutral-900"
      to={to}
    >
      {children}
    </Link>
  );
}

function MobileNavigation() {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = useLocation().pathname;
  const prevPathnameRef = useRef(pathname);

  // Close the menu when the pathname changes
  useEffect(() => {
    if (prevPathnameRef.current !== pathname && open) {
      setOpen(false);
    }
    prevPathnameRef.current = pathname;
  }, [pathname, open]);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        render={() => (
          <button
            aria-label="Open menu"
            className="rounded-lg p-2 transition-colors hover:bg-neutral-200 lg:hidden"
            type="button"
          >
            <Menu className="size-6" />
          </button>
        )}
      />
      <SheetContent className="w-full sm:max-w-sm" side="right">
        <SheetTitle>
          <Link to="/">Kayle</Link>
        </SheetTitle>
        <nav className="mt-8 flex flex-col gap-4">
          {navigationItems.map((item) => (
            <div
              className="border-neutral-200 border-b pb-4"
              key={item.section}
            >
              <h3 className="font-medium text-neutral-600 text-sm">
                {item.section}
              </h3>
              <ul className="mt-2 flex flex-col gap-y-2">
                {item.items.map((i) => (
                  <MobileNavItem key={i.to} to={i.to}>
                    {i.label}
                  </MobileNavItem>
                ))}
              </ul>
            </div>
          ))}
          <div className="pt-4">
            <Link
              className="block w-full rounded-full bg-neutral-900 px-4 py-2 text-center text-white transition-all duration-200 ease-in-out hover:bg-neutral-800"
              to={status === "authenticated" ? "/dashboard" : "/sign-in"}
            >
              Get Started
            </Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function Header() {
  const { status } = useAuth();

  return (
    <header className="fixed top-0 right-0 left-0 z-50 border-neutral-100 border-b bg-white/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-12">
            <Link to="/">
              <Logo title="Kayle ID" />
            </Link>
            <NavigationMenu className="z-50 hidden lg:flex">
              <NavigationMenuList>
                {navigationItems.map((item) => (
                  <NavigationMenuItem key={item.section}>
                    <NavigationMenuTrigger>
                      {item.section}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[400px] gap-1">
                        {item.items.map((i) => (
                          <ListItem key={i.to} title={i.label} to={i.to}>
                            {i.description}
                          </ListItem>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <MobileNavigation />
            </div>
            <NavItem
              className="hidden lg:flex"
              to={status === "authenticated" ? "/dashboard" : "/sign-in"}
              variant="button"
            >
              Get Started
            </NavItem>
          </div>
        </div>
      </div>
    </header>
  );
}
