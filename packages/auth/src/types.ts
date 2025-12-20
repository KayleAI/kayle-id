import type { client } from "./client";

export type AuthContext = typeof client.$Infer.Session;
export type Session = AuthContext["session"];
export type User = AuthContext["user"];
export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
};

export type ApiKey = {
  id: string;
  name: string;
  enabled: boolean;
  permissions: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  requestCount: number;
};
