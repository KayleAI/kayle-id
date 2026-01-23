import { DurableObject } from "cloudflare:workers";
import type { AttemptPhase } from "@kayle-id/config/e2ee-types";
import type { PhaseUpdateRequest, RelayMessage } from "@/shared/verify";
import type { VerificationSession } from "@/types/verification";

/**
 * WebSocket attachment data for subscribed clients.
 */
type WebSocketAttachment = {
  /** The client's public key for secure matching */
  publicKey: string;
  /** The attempt ID this subscription is for */
  attemptId: string;
  /** When the subscription was created */
  subscribedAt: number;
  /** Whether this client has subscribed (sent subscribe message) */
  isSubscribed: boolean;
};

/**
 * Bootstrap data stored per attempt.
 */
type AttemptBootstrap = {
  clientPublicKey: string;
  mobileWriteToken: string;
  createdAt: number;
};

/**
 * Client -> Server message types
 */
type ClientMessage =
  | { type: "subscribe"; publicKey: string; attemptId: string }
  | { type: "ping" }
  | { type: "get_session" }
  | { type: "get_phase"; attemptId: string };

/**
 * Server -> Client message types
 */
type ServerMessage =
  | { type: "subscribed"; phase: AttemptPhase; attemptId: string }
  | { type: "pong" }
  | { type: "session"; data: VerificationSession }
  | {
      type: "phase";
      attemptId: string;
      phase: AttemptPhase;
      error?: string;
      seq?: number;
      timestamp?: number;
    }
  | {
      type: "data";
      dataType: string;
      e2ee: unknown;
      seq: number;
      timestamp: number;
    }
  | { type: "error"; message: string };

/**
 * VerifySessionService is a Durable Object that manages verification sessions.
 * It handles:
 * - Native WebSocket connections from desktop clients (with hibernation)
 * - HTTP API for mobile data uploads
 * - Broadcasting notifications to subscribed clients
 * - Phase tracking and persistence
 */
export class VerifySessionService extends DurableObject<CloudflareBindings> {
  /** Current phase per attempt (attemptId -> phase) */
  private readonly attemptPhases: Map<string, AttemptPhase> = new Map();

  /** Bootstrap data per attempt (attemptId -> bootstrap) */
  private readonly attemptBootstraps: Map<string, AttemptBootstrap> = new Map();

  /** Sequence counter for messages */
  private messageSeq = 0;

  /** Session data (loaded from request) */
  private session: VerificationSession | null = null;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);

    // Restore state from storage
    this.ctx.blockConcurrencyWhile(async () => {
      const storedPhases =
        await this.ctx.storage.get<Record<string, AttemptPhase>>(
          "attemptPhases"
        );
      if (storedPhases) {
        for (const [attemptId, phase] of Object.entries(storedPhases)) {
          this.attemptPhases.set(attemptId, phase);
        }
      }

      const storedBootstraps =
        await this.ctx.storage.get<Record<string, AttemptBootstrap>>(
          "attemptBootstraps"
        );
      if (storedBootstraps) {
        for (const [attemptId, bootstrap] of Object.entries(storedBootstraps)) {
          this.attemptBootstraps.set(attemptId, bootstrap);
        }
      }

      const storedSeq = await this.ctx.storage.get<number>("messageSeq");
      if (storedSeq) {
        this.messageSeq = storedSeq;
      }
    });
  }

  /**
   * Handle incoming HTTP requests to the Durable Object.
   */
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade requests - single /ws endpoint
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    // Handle relay push from mobile (stores data and notifies desktop)
    if (request.method === "POST" && url.pathname.endsWith("/relay")) {
      return this.handleRelayPush(request);
    }

    // Handle phase update from mobile
    if (request.method === "POST" && url.pathname.endsWith("/phase")) {
      return this.handlePhaseUpdate(request);
    }

    // Handle bootstrap data storage
    if (request.method === "POST" && url.pathname.endsWith("/bootstrap")) {
      return this.handleBootstrapStore(request);
    }

    // Handle status check
    if (request.method === "GET" && url.pathname.endsWith("/status")) {
      return this.handleStatusCheck();
    }

    // Handle phase query
    if (request.method === "GET" && url.pathname.endsWith("/phase")) {
      return this.handlePhaseQuery(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  /**
   * Handle native WebSocket upgrade.
   * Uses Cloudflare's Durable Object WebSocket hibernation API.
   */
  private handleWebSocketUpgrade(request: Request): Response {
    // Get session data from request headers (set by the route handler)
    const sessionHeader = request.headers.get("X-Session-Data");
    if (sessionHeader) {
      try {
        this.session = JSON.parse(sessionHeader) as VerificationSession;
      } catch {
        this.session = null;
      }
    }

    if (!this.session) {
      return new Response("Session data required", { status: 400 });
    }

    // Create WebSocket pair
    // biome-ignore lint/correctness/noUndeclaredVariables: This is a Cloudflare Worker's global
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket with hibernation support
    // No tags yet - will be set when client sends subscribe message
    this.ctx.acceptWebSocket(server);

    // Initialize attachment with empty subscription data
    server.serializeAttachment({
      publicKey: "",
      attemptId: "",
      subscribedAt: 0,
      isSubscribed: false,
    } satisfies WebSocketAttachment);

    console.log("[DO WS] WebSocket connected, waiting for subscribe message");

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket messages (Durable Object hibernation API).
   * This method is called when the DO wakes from hibernation.
   */
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") {
      this.sendError(ws, "Binary messages not supported");
      return;
    }

    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message) as ClientMessage;
    } catch {
      this.sendError(ws, "Invalid JSON message");
      return;
    }

    switch (parsed.type) {
      case "subscribe":
        this.handleSubscribe(ws, parsed.publicKey, parsed.attemptId);
        break;

      case "ping":
        this.send(ws, { type: "pong" });
        break;

      case "get_session":
        this.handleGetSession(ws);
        break;

      case "get_phase":
        this.handleGetPhase(ws, parsed.attemptId);
        break;

      default:
        this.sendError(
          ws,
          `Unknown message type: ${(parsed as { type: string }).type}`
        );
    }
  }

  /**
   * Handle subscribe message from client.
   */
  private handleSubscribe(
    ws: WebSocket,
    publicKey: string,
    attemptId: string
  ): void {
    // Verify the bootstrap exists for this attempt
    const bootstrap = this.attemptBootstraps.get(attemptId);
    if (!bootstrap) {
      this.sendError(ws, "No bootstrap data for attempt");
      return;
    }

    if (bootstrap.clientPublicKey !== publicKey) {
      this.sendError(ws, "Invalid public key");
      return;
    }

    // Update the WebSocket attachment with subscription data
    ws.serializeAttachment({
      publicKey,
      attemptId,
      subscribedAt: Date.now(),
      isSubscribed: true,
    } satisfies WebSocketAttachment);

    // Send confirmation with current phase
    const currentPhase = this.attemptPhases.get(attemptId) ?? "initialized";
    this.send(ws, {
      type: "subscribed",
      phase: currentPhase,
      attemptId,
    });
  }

  /**
   * Handle get_session message from client.
   */
  private handleGetSession(ws: WebSocket): void {
    if (this.session) {
      this.send(ws, { type: "session", data: this.session });
    } else {
      this.sendError(ws, "Session not available");
    }
  }

  /**
   * Handle get_phase message from client.
   */
  private handleGetPhase(ws: WebSocket, attemptId: string): void {
    const phase = this.attemptPhases.get(attemptId) ?? "initialized";
    this.send(ws, {
      type: "phase",
      attemptId,
      phase,
    });
  }

  /**
   * Handle WebSocket close events (Durable Object hibernation API).
   * When a subscribed client disconnects, mark the attempt as expired.
   */
  webSocketClose(ws: WebSocket, _code: number, _reason: string): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;

    if (attachment?.isSubscribed) {
      // Check if this was the last WebSocket for this attempt
      const remainingSockets = this.ctx.getWebSockets().filter((otherWs) => {
        if (otherWs === ws) {
          return false;
        }
        const otherAttachment =
          otherWs.deserializeAttachment() as WebSocketAttachment | null;
        return (
          otherAttachment?.isSubscribed &&
          otherAttachment.attemptId === attachment.attemptId
        );
      });

      // If no other clients are connected for this attempt, mark it as expired
      if (remainingSockets.length === 0) {
        this.expireAttempt(attachment.attemptId);
      }
    }
  }

  /**
   * Handle WebSocket errors (Durable Object hibernation API).
   */
  webSocketError(_ws: WebSocket, error: unknown): void {
    console.error("[DO WS] WebSocket error:", error);
  }

  /**
   * Send a message to a WebSocket.
   */
  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (e) {
      console.error("[DO WS] Failed to send message:", e);
    }
  }

  /**
   * Send an error message to a WebSocket.
   */
  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, { type: "error", message });
  }

  /**
   * Store bootstrap data for an attempt.
   */
  private async handleBootstrapStore(request: Request): Promise<Response> {
    try {
      const { attemptId, clientPublicKey, mobileWriteToken } =
        (await request.json()) as {
          attemptId: string;
          clientPublicKey: string;
          mobileWriteToken: string;
        };

      const bootstrap: AttemptBootstrap = {
        clientPublicKey,
        mobileWriteToken,
        createdAt: Date.now(),
      };

      this.attemptBootstraps.set(attemptId, bootstrap);

      // Persist to storage
      const bootstrapsObj = Object.fromEntries(this.attemptBootstraps);
      await this.ctx.storage.put("attemptBootstraps", bootstrapsObj);

      // Initialize phase
      this.attemptPhases.set(attemptId, "initialized");
      const phasesObj = Object.fromEntries(this.attemptPhases);
      await this.ctx.storage.put("attemptPhases", phasesObj);

      return Response.json({ success: true, attemptId });
    } catch (error) {
      return Response.json(
        { success: false, error: String(error) },
        { status: 400 }
      );
    }
  }

  /**
   * Handle relay push from mobile via the API.
   * Broadcasts to subscribed clients whose publicKey matches.
   */
  private async handleRelayPush(request: Request): Promise<Response> {
    try {
      const message = (await request.json()) as RelayMessage;

      // Get the bootstrap data to verify the client public key
      const bootstrap = this.attemptBootstraps.get(message.attemptId);
      if (!bootstrap) {
        return Response.json(
          { success: false, error: "No bootstrap data for attempt" },
          { status: 404 }
        );
      }

      // Increment sequence
      this.messageSeq += 1;
      await this.ctx.storage.put("messageSeq", this.messageSeq);

      // Add sequence to message
      const seqMessage: RelayMessage = {
        ...message,
        seq: this.messageSeq,
        timestamp: Date.now(),
      };

      // Broadcast to subscribed clients
      const deliveredCount = this.broadcastToSubscribers(
        seqMessage,
        bootstrap.clientPublicKey
      );

      return Response.json({
        success: true,
        deliveredCount,
        timestamp: Date.now(),
      });
    } catch (error) {
      return Response.json(
        { success: false, error: String(error) },
        { status: 400 }
      );
    }
  }

  /**
   * Handle phase update from mobile via the API.
   */
  private async handlePhaseUpdate(request: Request): Promise<Response> {
    try {
      const { attemptId, phase, error } =
        (await request.json()) as PhaseUpdateRequest;

      console.log("[DO Phase] Received phase update:", {
        attemptId,
        phase,
        error,
        bootstrapCount: this.attemptBootstraps.size,
      });

      // Get the bootstrap data
      const bootstrap = this.attemptBootstraps.get(attemptId);
      if (!bootstrap) {
        console.log("[DO Phase] No bootstrap data for attempt:", attemptId);
        return Response.json(
          { success: false, error: "No bootstrap data for attempt" },
          { status: 404 }
        );
      }

      // Store the phase
      this.attemptPhases.set(attemptId, phase);
      const phasesObj = Object.fromEntries(this.attemptPhases);
      await this.ctx.storage.put("attemptPhases", phasesObj);

      // Increment sequence
      this.messageSeq += 1;
      await this.ctx.storage.put("messageSeq", this.messageSeq);

      // Create phase message
      const phaseMessage: RelayMessage = {
        type: "phase",
        seq: this.messageSeq,
        attemptId,
        phase,
        error,
        timestamp: Date.now(),
      };

      // Broadcast to subscribed clients
      const deliveredCount = this.broadcastToSubscribers(
        phaseMessage,
        bootstrap.clientPublicKey
      );

      return Response.json({
        success: true,
        phase,
        deliveredCount,
        timestamp: Date.now(),
      });
    } catch (error) {
      return Response.json(
        { success: false, error: String(error) },
        { status: 400 }
      );
    }
  }

  /**
   * Handle phase query requests.
   */
  private handlePhaseQuery(request: Request): Response {
    const url = new URL(request.url);
    const attemptId = url.searchParams.get("attemptId");

    if (!attemptId) {
      return Response.json(
        { success: false, error: "attemptId is required" },
        { status: 400 }
      );
    }

    const phase = this.attemptPhases.get(attemptId) ?? "initialized";

    return Response.json({
      success: true,
      attemptId,
      phase,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle status check requests.
   */
  private handleStatusCheck(): Response {
    const webSockets = this.ctx.getWebSockets();
    const subscribedCount = webSockets.filter((ws) => {
      const attachment =
        ws.deserializeAttachment() as WebSocketAttachment | null;
      return attachment?.isSubscribed;
    }).length;

    return Response.json({
      status: "active",
      connections: webSockets.length,
      subscribed: subscribedCount,
      attempts: this.attemptPhases.size,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast a message to all subscribed WebSocket clients with matching publicKey.
   */
  private broadcastToSubscribers(
    message: RelayMessage,
    clientPublicKey: string
  ): number {
    let deliveredCount = 0;
    const messageJson = JSON.stringify(message);

    const webSockets = this.ctx.getWebSockets();
    console.log("[DO Broadcast] Total WebSockets:", webSockets.length);

    for (const ws of webSockets) {
      try {
        const attachment =
          ws.deserializeAttachment() as WebSocketAttachment | null;
        if (!attachment?.isSubscribed) {
          continue;
        }

        const publicKeyMatch = attachment.publicKey === clientPublicKey;
        const attemptIdMatch = attachment.attemptId === message.attemptId;

        if (publicKeyMatch && attemptIdMatch) {
          ws.send(messageJson);
          deliveredCount += 1;
        }
      } catch (e) {
        console.log("[DO Broadcast] Failed to send:", e);
      }
    }

    console.log("[DO Broadcast] Complete:", { deliveredCount });
    return deliveredCount;
  }

  /**
   * Get the current phase for an attempt.
   */
  getPhase(attemptId: string): AttemptPhase {
    return this.attemptPhases.get(attemptId) ?? "initialized";
  }

  /**
   * Mark an attempt as expired.
   * Called when the client disconnects without completing verification.
   */
  private expireAttempt(attemptId: string): void {
    // Update phase to expired
    this.attemptPhases.set(attemptId, "expired");

    // Persist to storage (fire and forget)
    const phasesObj = Object.fromEntries(this.attemptPhases);
    this.ctx.storage.put("attemptPhases", phasesObj).catch((e) => {
      console.error("[DO] Failed to persist expired phase:", e);
    });

    // Remove bootstrap data (invalidates the attempt)
    this.attemptBootstraps.delete(attemptId);

    // Persist bootstrap changes
    const bootstrapsObj = Object.fromEntries(this.attemptBootstraps);
    this.ctx.storage.put("attemptBootstraps", bootstrapsObj).catch((e) => {
      console.error("[DO] Failed to persist bootstrap removal:", e);
    });
  }
}
