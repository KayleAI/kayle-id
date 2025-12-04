import { RpcTarget } from "capnweb";

export class VerifySession extends RpcTarget {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: this is fine
  private readonly env: CloudflareBindings;
  private readonly sessionId: string;

  constructor(env: CloudflareBindings, sessionId: string) {
    super();
    this.env = env;
    this.sessionId = sessionId;
  }

  ping() {
    return "pong";
  }

  getSession() {
    return this.sessionId;
  }
}
