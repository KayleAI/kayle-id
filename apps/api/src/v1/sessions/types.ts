export type SessionsAppEnv = {
  Bindings: CloudflareBindings;
  Variables: {
    organizationId: string;
    environment: "live" | "test" | "either";
    type: "api" | "session";
  };
};
