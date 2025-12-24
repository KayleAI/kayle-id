import { client } from "@kayle-id/auth/client";
import { useAuth } from "@kayle-id/auth/client/provider";
import { Avatar, AvatarFallback, AvatarImage } from "@kayleai/ui/avatar";
import { Button } from "@kayleai/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kayleai/ui/dropdown-menu";
import { Logo, Logomark } from "@kayleai/ui/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@kayleai/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@kayleai/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronsUpDownIcon,
  CodeSquare,
  EllipsisVerticalIcon,
  Key,
  LayoutDashboard,
  LogOutIcon,
  PanelLeftIcon,
  PlusIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

const navItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "API Keys",
    url: "/api-keys",
    icon: Key,
  },
  {
    title: "Sandbox",
    url: "/sandbox",
    icon: CodeSquare,
  },
];

export function AppSidebar() {
  const { user, activeOrganization, organizations } = useAuth();
  const routerState = useRouterState();
  const queryClient = useQueryClient();
  const currentPath = routerState.location.pathname;

  const handleSelectOrganization = async (
    organizationId: string,
    organizationSlug: string
  ) => {
    try {
      await client.organization.setActive({
        organizationId,
        organizationSlug,
      });
    } finally {
      // Invalidate any queries that depend on the organization
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    }
  };

  return (
    <Sidebar
      className="border-r-0! bg-accent!"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarLogo />

      <SidebarSeparator className="mx-0!" />

      <SidebarContent className="bg-accent!">
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <TooltipProvider>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <SidebarMenuButton
                            className="hover:bg-accent-foreground/2.5 active:bg-accent-foreground/5 data-active:bg-accent-foreground/2.5 data-active:font-semibold"
                            isActive={currentPath.startsWith(item.url)}
                            render={
                              <Link to={item.url}>
                                <item.icon />
                                <span>{item.title}</span>
                              </Link>
                            }
                          />
                        }
                      />
                      <TooltipContent side="right">{item.title}</TooltipContent>
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </TooltipProvider>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-0 bg-accent! p-0!">
        {/* User Section */}
        <SidebarMenu className="border-accent-foreground/10 border-t p-2">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    size="lg"
                  >
                    <Avatar className="size-8 rounded-lg grayscale">
                      <AvatarImage
                        alt={user?.name}
                        src={user?.image ?? undefined}
                      />
                      <AvatarFallback className="rounded-lg">
                        {user?.email?.charAt(0).toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">
                        {(user?.name || user?.email?.split("@")[0]) ?? "User"}
                      </span>
                      <span className="truncate text-muted-foreground text-xs">
                        {user?.email}
                      </span>
                    </div>
                    <EllipsisVerticalIcon className="ml-auto size-4" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                align="end"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side="right"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="size-8 rounded-lg">
                        <AvatarImage
                          alt={user?.name}
                          src={user?.image ?? undefined}
                        />
                        <AvatarFallback className="rounded-lg">
                          {user?.email?.charAt(0).toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-medium">
                          {(user?.name || user?.email?.split("@")[0]) ?? "User"}
                        </span>
                        <span className="truncate text-muted-foreground text-xs">
                          {user?.email}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<Link to="/account" />}>
                    <UserIcon />
                    My Account
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link to="/account/settings" />}>
                    <SettingsIcon />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link to="/sign-out" />}>
                  <LogOutIcon />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Organization Section */}
        <SidebarMenu className="border-accent-foreground/10 border-t p-2">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    size="lg"
                  >
                    <Avatar className="size-8">
                      <AvatarImage
                        src={activeOrganization?.logo ?? undefined}
                      />
                      <AvatarFallback className="rounded-lg">
                        {activeOrganization?.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {activeOrganization?.name ?? "My Organization"}
                      </span>
                      <span className="truncate text-muted-foreground text-xs">
                        {activeOrganization?.slug ?? "organization"}
                      </span>
                    </div>
                    <ChevronsUpDownIcon className="ml-auto size-4" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                align="end"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side="right"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground text-xs">
                    {activeOrganization?.name ?? "My Organization"}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    render={<Link to="/organizations/members" />}
                  >
                    <UsersIcon />
                    Members
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    render={<Link to="/organizations/settings" />}
                  >
                    <SettingsIcon />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-muted-foreground text-xs">
                    Organizations
                  </DropdownMenuLabel>
                  {organizations.map((organization) => (
                    <DropdownMenuItem
                      key={organization.id}
                      render={
                        <Button
                          className="flex w-full items-center justify-start pl-1.5!"
                          onClick={() => {
                            toast.promise(
                              handleSelectOrganization(
                                organization.id,
                                organization.slug
                              ),
                              {
                                loading: "Switching organization...",
                                success: "Organization switched successfully",
                                error: "Failed to switch organization",
                              }
                            );
                          }}
                          variant="ghost"
                        />
                      }
                    >
                      <Avatar className="size-5.5 rounded-lg">
                        <AvatarImage src={organization.logo ?? undefined} />
                        <AvatarFallback className="rounded-lg">
                          {organization.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {organization.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    render={<Link to="/organizations/create" />}
                  >
                    <PlusIcon />
                    Create Organization
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarLogo() {
  const { toggleSidebar, state } = useSidebar();

  const isCollapsed = useMemo(() => state === "collapsed", [state]);

  return (
    <SidebarHeader className="bg-accent!">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            className="group/logo flex"
            onClick={toggleSidebar}
          >
            <div className="flex h-8 w-auto min-w-8 items-center justify-start">
              {isCollapsed ? (
                <Logomark className="group-hover/logo:hidden" />
              ) : (
                <Logo className="group-hover/logo:hidden" />
              )}
              <span className="hidden flex-row items-center justify-center gap-2 font-medium text-sm group-hover/logo:flex">
                <PanelLeftIcon className="size-4" />
                Close&nbsp;Sidebar
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
