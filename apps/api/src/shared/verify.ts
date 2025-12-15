import { type RpcStub, RpcTarget } from "capnweb";
import type { VerificationSession } from "@/types/verification";

type RpcClients = {
  onMessage(text: string): void;
};

export class VerifySession extends RpcTarget {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: this is fine
  private readonly env: CloudflareBindings;
  private readonly session: VerificationSession;
  private client?: RpcStub<RpcClients>;

  constructor(env: CloudflareBindings, session: VerificationSession) {
    super();
    this.env = env;
    this.session = session;
  }

  /**
   * Subscribe the client to the session.
   *
   * Allows the server to send messages to the client.
   *
   * @param client - The client to subscribe to the session.
   */
  subscribe(client: RpcStub<RpcClients>) {
    this.client = client;
  }

  /**
   * Unsubscribe the client from the session.
   */
  unsubscribe() {
    this.client = undefined;
  }

  /**
   * Send a message to the client.
   *
   * @param message - The message to send.
   */
  sendMessage(message: string) {
    this.client?.onMessage(message);
  }

  /**
   * Ping the session to check if it is still alive.
   *
   * @returns "pong" if the session is still alive.
   */
  ping() {
    return "pong";
  }

  /**
   * Get the session.
   *
   * @returns The session.
   */
  getSession() {
    return this.session;
  }

  /**
   * Notify Kayle ID that the user is not on a mobile device capable of reading ePassports.
   *
   * @note The desktop client should ask the user to use a mobile device instead.
   */
  notifyNoHardware() {
    // TODO: When this function is called, we need to start polling the database for the session status.
    // Once it changes to `in_progress`, we can close the websocket connection by sending a message
    // to the client saying that the handoff to mobile has completed.
  }
}
