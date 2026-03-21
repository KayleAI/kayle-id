export type SessionsAppEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    environment: "live";
    type: "api" | "session";
  };
};
