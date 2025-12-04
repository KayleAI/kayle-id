import {
  newHttpBatchRpcResponse,
  newWorkersWebSocketRpcResponse,
} from "capnweb";
import { type Context, Hono } from "hono";
import { upgradeWebSocket } from "hono/cloudflare-workers";
import type { UpgradeWebSocket } from "hono/ws";
import { VerifySession } from "@/shared/verify";

const verify = new Hono<{ Bindings: CloudflareBindings }>();

export function newRpcResponse(
  c: Context,
  localMain: unknown,
  options?: { upgradeWebSocket?: UpgradeWebSocket }
): Response | Promise<Response> {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
    return newHttpBatchRpcResponse(c.req.raw, localMain);
  }

  // biome-ignore lint/correctness/noUndeclaredVariables: this is a global in Cloudflare Workers
  if (options?.upgradeWebSocket && typeof WebSocketPair !== "undefined") {
    return newWorkersWebSocketRpcResponse(c.req.raw, localMain);
  }

  return new Response("Bad request", { status: 400 });
}

verify.all("/connect", (c) =>
  newRpcResponse(c, new VerifySession(c.env), {
    upgradeWebSocket,
  })
);

export default verify;
