import { RpcTarget } from "capnweb";

export class VerifySession extends RpcTarget {
  private readonly env: CloudflareBindings;

  constructor(env: CloudflareBindings) {
    super();
    this.env = env;
  }

  ping() {
    return "pong";
  }

  // TODO: Actually authenticate the session
  authenticate(sessionId: string) {
    // conduct authentication against the session ID

    return new AuthenticatedVerifySession(this.env, sessionId);
  }
}

export class AuthenticatedVerifySession extends RpcTarget {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: this is fine
  private readonly env: CloudflareBindings;
  private readonly sessionId: string;

  constructor(env: CloudflareBindings, sessionId: string) {
    super();
    this.env = env;
    this.sessionId = sessionId;
  }

  hello(name: string) {
    return `Hello, ${name}! (${this.sessionId})`;
  }
}
