import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { client } from "../client";
import type { Organization, Session, User } from "../types";

type AuthContextType = {
  activeOrganization: Organization | null;
  organizations: Organization[];
  user: User | null;
  session: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  error: Error | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");
  const [activeOrganization, setActiveOrganization] =
    useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const { data, isPending, error, refetch } = client.useSession();

  async function refresh() {
    await refetch();
  }

  useEffect(() => {
    if (isPending) {
      return;
    }

    if (data) {
      setStatus("authenticated");
      setActiveOrganization(data?.activeOrganization ?? null);
      setOrganizations(data?.organizations ?? []);
    } else {
      setStatus("unauthenticated");
    }
  }, [data, isPending]);

  const value = {
    activeOrganization,
    organizations,
    status,
    session: data?.session ?? null,
    user: data?.user ?? null,
    error,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
